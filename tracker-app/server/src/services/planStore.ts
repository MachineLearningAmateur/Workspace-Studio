import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  type ActivityRow,
  ensureTrackerFile,
  getTrackerCsvPath,
  loadActivityRows,
  replaceActivityRowsFromCsv,
  saveActivityRows
} from "./csvStore.js";

export type PlanRevisionStatus = "ready" | "codex_completed" | "codex_not_configured" | "codex_failed";

export interface PlanSummary {
  id: string;
  name: string;
  csv_path: string;
  markdown_path: string;
  prompt_path: string;
  created_at: string;
  updated_at: string;
  revision_status: PlanRevisionStatus;
  revision_message: string;
  source_files: string[];
  base_plan_id?: string;
}

export interface MarkdownPlanFile {
  filename: string;
  content: string;
}

export interface CreatePlanInput {
  name: string;
  basePlanId?: string;
  files: MarkdownPlanFile[];
}

export interface PlanProgressMessage {
  timestamp: string;
  message: string;
}

export interface CreatePlanOptions {
  onProgress?: (message: string) => void;
}

export interface PlanWorkspaceMigrationResult {
  workspace: {
    id: string;
    name: string;
    kind: "learning" | "job_search";
    source_type: "generic_learning" | "generic_job_search" | "legacy_plan" | "job_applications";
    source_ref: string;
    description: string;
    subject_ids: string[];
    board_config: {
      lane_type: "status";
      lanes: Array<{ id: string; label: string }>;
    };
  };
  migrated_card_count: number;
  deleted_plan_id: string;
}

interface PlanRegistry {
  plans: PlanSummary[];
}

const maxMarkdownBytes = 1_500_000;
const defaultCodexReviseCommand =
  'codex exec --skip-git-repo-check --sandbox read-only --ephemeral --json --output-last-message "{outputFile}" -';

export function getPlanDataDir() {
  return path.resolve(process.env.TRACKER_DATA_DIR ?? "./data");
}

export function getPlanRegistryPath() {
  return path.join(getPlanDataDir(), "plans.json");
}

export async function cleanupRemovedFeatureData() {
  await fs.rm(path.join(getPlanDataDir(), "mock-interview-sessions"), { recursive: true, force: true });
}

export async function ensurePlanRegistry() {
  await ensureTrackerFile();

  try {
    const raw = await fs.readFile(getPlanRegistryPath(), "utf8");
    const registry = JSON.parse(raw) as PlanRegistry;

    if (Array.isArray(registry.plans)) {
      return;
    }

    throw new Error("plans must be an array");
  } catch (error) {
    if (!isFileNotFound(error)) {
      throw error;
    }
  }

  const now = new Date().toISOString();
  await writeRegistry({
    plans: []
  });
}

export async function listPlans() {
  const registry = await readRegistry();
  return registry.plans;
}

export async function getPlanById(planId: string) {
  if (!planId?.trim()) {
    throw new PlanStoreError("planId is required", 400);
  }

  const registry = await readRegistry();
  const plan = registry.plans.find((candidate) => candidate.id === planId);

  if (!plan) {
    throw new PlanStoreError(`Plan not found: ${planId}`, 404);
  }

  return plan;
}

export async function getPlanCsvPath(planId: string) {
  const plan = await getPlanById(planId);
  return plan.csv_path;
}

export async function deletePlan(planId: string) {
  if (!planId) {
    throw new PlanStoreError("Plan id is required", 400);
  }

  const registry = await readRegistry();
  const plan = registry.plans.find((candidate) => candidate.id === planId);

  if (!plan) {
    throw new PlanStoreError(`Plan not found: ${planId}`, 404);
  }

  const nextPlans = registry.plans.filter((candidate) => candidate.id !== planId);
  await writeRegistry({ plans: nextPlans });
  await deletePlanFiles(plan);
  return plan;
}

export async function migratePlanToWorkspace(planId: string): Promise<PlanWorkspaceMigrationResult> {
  const plan = await getPlanById(planId);
  const oldWorkspaceId = `plan-${plan.id}`;
  const { migrateLegacyPlanToWorkspace, deleteLegacyPlanWorkspaceStorage } = await import("./workspaceStore.js");
  const { retargetPlanChats } = await import("./chatStore.js");
  const { retargetPlanLearningSessions } = await import("./learningSessionStore.js");

  const migration = await migrateLegacyPlanToWorkspace(plan);
  await retargetPlanChats(plan.id, oldWorkspaceId, migration.workspace.id);
  await retargetPlanLearningSessions(plan.id, migration.workspace.id);

  const registry = await readRegistry();
  await writeRegistry({
    plans: registry.plans.filter((candidate) => candidate.id !== plan.id)
  });
  await deletePlanFiles(plan);
  await deleteLegacyPlanWorkspaceStorage(plan.id);

  return {
    workspace: migration.workspace,
    migrated_card_count: migration.migrated_card_count,
    deleted_plan_id: plan.id
  };
}

export async function createPlanFromRows(input: { name: string; basePlanId?: string; rows: ActivityRow[]; revisionMessage: string; sourceFiles?: string[] }) {
  const registry = await readRegistry();
  const basePlan = input.basePlanId ? registry.plans.find((plan) => plan.id === input.basePlanId) : undefined;

  if (input.basePlanId && !basePlan) {
    throw new PlanStoreError(`Base plan not found: ${input.basePlanId}`, 404);
  }

  const id = uniquePlanId(input.name, registry.plans);
  const planDir = path.join(getPlanDataDir(), "plans", id);
  const csvPath = path.join(planDir, "study_activities.csv");
  const now = new Date().toISOString();

  await fs.mkdir(planDir, { recursive: true });
  await saveActivityRows(input.rows, csvPath);

  const plan: PlanSummary = {
    id,
    name: input.name.trim(),
    csv_path: csvPath,
    markdown_path: "",
    prompt_path: "",
    created_at: now,
    updated_at: now,
    revision_status: "codex_completed",
    revision_message: input.revisionMessage,
    source_files: input.sourceFiles ?? [],
    base_plan_id: basePlan?.id
  };

  registry.plans.push(plan);
  await writeRegistry(registry);
  return plan;
}

export async function replacePlanRows(planId: string, rows: ActivityRow[]) {
  const registry = await readRegistry();
  const plan = registry.plans.find((candidate) => candidate.id === planId);

  if (!plan) {
    throw new PlanStoreError(`Plan not found: ${planId}`, 404);
  }

  await saveActivityRows(rows, plan.csv_path);
  const now = new Date().toISOString();
  const updatedPlan: PlanSummary = {
    ...plan,
    updated_at: now,
    revision_status: "codex_completed",
    revision_message: "Replaced from Codex chat CSV preview."
  };

  await writeRegistry({
    plans: registry.plans.map((candidate) => (candidate.id === planId ? updatedPlan : candidate))
  });

  return updatedPlan;
}

export async function appendPlanRows(planId: string, rows: ActivityRow[]) {
  const registry = await readRegistry();
  const plan = registry.plans.find((candidate) => candidate.id === planId);

  if (!plan) {
    throw new PlanStoreError(`Plan not found: ${planId}`, 404);
  }

  const existingRows = await loadActivityRows(plan.csv_path);
  await saveActivityRows([...existingRows.map(({ row_index: _rowIndex, ...row }) => row), ...rows], plan.csv_path);
  const now = new Date().toISOString();
  const updatedPlan: PlanSummary = {
    ...plan,
    updated_at: now,
    revision_status: "codex_completed",
    revision_message: `Added ${rows.length} row${rows.length === 1 ? "" : "s"} from Codex chat CSV preview.`
  };

  await writeRegistry({
    plans: registry.plans.map((candidate) => (candidate.id === planId ? updatedPlan : candidate))
  });

  return updatedPlan;
}

export async function createPlanFromMarkdown(input: CreatePlanInput, options: CreatePlanOptions = {}) {
  const files = normalizeMarkdownFiles(input.files);
  const registry = await readRegistry();
  const basePlan = input.basePlanId ? registry.plans.find((plan) => plan.id === input.basePlanId) : undefined;

  if (input.basePlanId && !basePlan) {
    throw new PlanStoreError(`Base plan not found: ${input.basePlanId}`, 404);
  }

  const id = uniquePlanId(input.name, registry.plans);
  const planDir = path.join(getPlanDataDir(), "plans", id);
  const csvPath = path.join(planDir, "study_activities.csv");
  const markdownPath = path.join(planDir, "source-plan.md");
  const promptPath = path.join(planDir, "codex-revision-prompt.md");
  const codexOutputPath = path.join(planDir, "codex-output.md");
  const combinedMarkdown = combineMarkdownFiles(files);
  options.onProgress?.(`Preparing plan "${input.name.trim()}" from ${files.length} markdown file${files.length === 1 ? "" : "s"}.`);
  const baseRows = basePlan ? await loadActivityRows(basePlan.csv_path) : [];
  const learningContext = basePlan
    ? await buildLearningContextForPlan(basePlan.id, options.onProgress)
    : {
        knowledge_base: "No base plan selected.",
        learning_sessions: []
      };
  const prompt = buildCodexPrompt(input.name, basePlan, baseRows, combinedMarkdown, learningContext);

  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(markdownPath, combinedMarkdown, "utf8");
  await fs.writeFile(promptPath, prompt, "utf8");
  options.onProgress?.(`Saved uploaded markdown and built the Codex revision prompt.`);

  const revision = await reviseWithCodex(prompt, csvPath, codexOutputPath, options.onProgress);

  if (!revision.usedCodexOutput) {
    options.onProgress?.("Generating fallback tracker rows from markdown.");
    const fallbackRows = generateFallbackRows(files);
    await saveActivityRows(fallbackRows, csvPath);
  }

  const now = new Date().toISOString();
  const plan: PlanSummary = {
    id,
    name: input.name.trim(),
    csv_path: csvPath,
    markdown_path: markdownPath,
    prompt_path: promptPath,
    created_at: now,
    updated_at: now,
    revision_status: revision.status,
    revision_message: revision.message,
    source_files: files.map((file) => file.filename),
    base_plan_id: basePlan?.id
  };

  registry.plans.push(plan);
  await writeRegistry(registry);
  options.onProgress?.(`Plan "${plan.name}" is ready with CSV ${plan.csv_path}.`);
  return plan;
}

export class PlanStoreError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

async function readRegistry(): Promise<PlanRegistry> {
  await ensureTrackerFile();

  try {
    const raw = await fs.readFile(getPlanRegistryPath(), "utf8");
    const registry = JSON.parse(raw) as PlanRegistry;

    if (!Array.isArray(registry.plans)) {
      throw new Error("plans must be an array");
    }

    return registry;
  } catch (error) {
    if (isFileNotFound(error)) {
      await ensurePlanRegistry();
      return readRegistry();
    }

    throw error;
  }
}

async function writeRegistry(registry: PlanRegistry) {
  await fs.mkdir(path.dirname(getPlanRegistryPath()), { recursive: true });
  await fs.writeFile(getPlanRegistryPath(), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

async function deletePlanFiles(plan: PlanSummary) {
  const planRoot = path.resolve(getPlanDataDir(), "plans");
  const dataRoot = path.resolve(getPlanDataDir());
  const planDirectory = path.resolve(path.dirname(plan.csv_path));

  if (!isPathInside(planDirectory, planRoot)) {
    await Promise.all([
      deleteTrackedPlanFile(plan.csv_path, dataRoot),
      deleteTrackedPlanFile(`${plan.csv_path}.row-ids.json`, dataRoot),
      deleteTrackedPlanFile(plan.markdown_path, dataRoot),
      deleteTrackedPlanFile(plan.prompt_path, dataRoot)
    ]);
    return;
  }

  await fs.rm(planDirectory, { recursive: true, force: true });
}

function normalizeMarkdownFiles(files: MarkdownPlanFile[]) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new PlanStoreError("Upload at least one markdown file", 400);
  }

  return files.map((file) => {
    const filename = sanitizeFilename(file.filename);
    const content = String(file.content ?? "");
    const byteLength = Buffer.byteLength(content, "utf8");

    if (!filename.toLowerCase().endsWith(".md")) {
      throw new PlanStoreError(`Only markdown files are supported: ${filename}`, 400);
    }

    if (!content.trim()) {
      throw new PlanStoreError(`Markdown file is empty: ${filename}`, 400);
    }

    if (byteLength > maxMarkdownBytes) {
      throw new PlanStoreError(`Markdown file is too large: ${filename}`, 400);
    }

    return { filename, content };
  });
}

function combineMarkdownFiles(files: MarkdownPlanFile[]) {
  return files.map((file) => `# ${file.filename}\n\n${file.content.trim()}\n`).join("\n\n---\n\n");
}

async function buildLearningContextForPlan(planId: string, onProgress?: (message: string) => void) {
  try {
    const { getLearningContextForPlan } = await import("./learningSessionStore.js");
    return await getLearningContextForPlan(planId);
  } catch (error) {
    onProgress?.(`Learning session context was unavailable: ${getErrorMessage(error)}`);
    return {
      knowledge_base: "No learning context available.",
      learning_sessions: []
    };
  }
}

function buildCodexPrompt(
  name: string,
  basePlan: PlanSummary | undefined,
  baseRows: ActivityRow[],
  markdown: string,
  learningContext: unknown
) {
  const baseJson = JSON.stringify(baseRows, null, 2);
  const learningJson = JSON.stringify(learningContext, null, 2);
  const basePlanName = basePlan?.name ?? "None selected";
  const preserveBaseInstruction = basePlan
    ? "- Preserve useful intent from the existing base curriculum while adapting to the uploaded plan."
    : "- Build the plan from the uploaded markdown and learning context without assuming an existing base curriculum.";

  return `You are revising an interview-prep curriculum for a local CSV tracker.

Create a complete replacement CSV for the new plan named "${name.trim()}".

Rules:
- Output only CSV text, no markdown fences or explanation.
- Use this exact header:
date,category,item_type,item_name,difficulty,status,time_spent_min,confidence,attempt_type,result,pattern,interview_relevance,scheduled_date,completed_at,source,notes
- category must be one of: arrays_hashing, two_pointers, stack, sliding_window, binary_search, linked_list, trees, trie, heap, intervals, backtracking, graphs, dp_1d, system_design, behavioral, review
- item_type must be one of: leetcode_new, leetcode_review, system_design, behavioral, notes_review
- difficulty is empty or one of: easy, medium, hard
- status must start as not_started unless the uploaded plan says otherwise.
- attempt_type and result should usually be empty for planned future work.
- interview_relevance must be high, medium, or low.
- Use YYYY-MM-DD for date. Use YYYY-MM-DD or YYYY-MM-DDTHH:mm for scheduled_date. Leave completed_at empty for future planned work.
- Keep notes concise, and use source to identify the uploaded plan or source file.
${preserveBaseInstruction}

Base plan: ${basePlanName}
Base tracker rows:
${baseJson}

Learning and knowledge context:
${learningJson}

Uploaded markdown plan:
${markdown}
`;
}

async function reviseWithCodex(
  prompt: string,
  csvPath: string,
  outputPath: string,
  onProgress?: (message: string) => void
): Promise<{
  usedCodexOutput: boolean;
  status: PlanRevisionStatus;
  message: string;
}> {
  const command = formatCodexCommand(process.env.CODEX_REVISE_COMMAND ?? defaultCodexReviseCommand, outputPath);

  if (command.trim().toLowerCase() === "off") {
    return {
      usedCodexOutput: false,
      status: "codex_not_configured",
      message: "Codex revision is disabled; generated a starter CSV from the markdown."
    };
  }

  try {
    onProgress?.(`Starting Codex revision command: ${command}`);
    const output = await runCommandWithStdin(command, prompt, onProgress);
    const finalOutput = await readOutputFile(outputPath);
    const csv = extractCsv(finalOutput || output);
    await replaceActivityRowsFromCsv(csv, csvPath);

    return {
      usedCodexOutput: true,
      status: "codex_completed",
      message: "Codex revised the curriculum and produced the plan CSV."
    };
  } catch (error) {
    return {
      usedCodexOutput: false,
      status: "codex_failed",
      message: `Codex revision failed with "${command}"; generated a starter CSV instead. ${getErrorMessage(error)}`
    };
  }
}

function runCommandWithStdin(command: string, input: string, onProgress?: (message: string) => void) {
  const timeoutMs = Number(process.env.CODEX_REVISE_TIMEOUT_MS ?? 120_000);

  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      shell: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let jsonBuffer = "";
    const expectsJson = command.includes("--json");
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (expectsJson) {
        jsonBuffer = emitCodexJsonProgress(`${jsonBuffer}${chunk}`, onProgress);
      } else {
        onProgress?.(`Codex wrote ${String(chunk).length.toLocaleString()} characters.`);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      const message = String(chunk).trim();
      if (message) {
        onProgress?.(message);
      }
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (jsonBuffer.trim()) {
        emitCodexJsonProgress(`${jsonBuffer}\n`, onProgress);
      }

      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `Command exited with code ${code}`));
      }
    });

    child.stdin.end(input);
  });
}

function emitCodexJsonProgress(buffer: string, onProgress?: (message: string) => void) {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    try {
      const event = JSON.parse(trimmed) as unknown;
      const message = summarizeCodexEvent(event);

      if (message) {
        onProgress?.(message);
      }
    } catch {
      onProgress?.(trimmed);
    }
  }

  return rest;
}

function summarizeCodexEvent(event: unknown): string | null {
  if (!isRecord(event)) {
    return null;
  }

  const type = typeof event.type === "string" ? event.type : "";

  if (type === "turn.started") {
    return "Codex started revising the curriculum.";
  }

  if (type === "turn.completed") {
    return "Codex finished a revision turn.";
  }

  if (type === "error") {
    return extractText(event) || "Codex reported an error.";
  }

  const item = isRecord(event.item) ? event.item : undefined;
  const itemType = item && typeof item.type === "string" ? item.type : "";

  if (type === "item.started" && itemType) {
    return `Codex started ${labelCodexItem(itemType)}.`;
  }

  if (type === "item.completed" && itemType === "message") {
    const text = extractText(item);
    const lineCount = text ? text.split(/\r?\n/).filter(Boolean).length : 0;
    return lineCount > 1 ? `Codex produced ${lineCount.toLocaleString()} lines of CSV output.` : text || "Codex produced a response.";
  }

  if (type === "item.completed" && itemType) {
    return `Codex completed ${labelCodexItem(itemType)}.`;
  }

  return null;
}

function labelCodexItem(itemType: string) {
  return itemType.replace(/_/g, " ");
}

function extractText(value: unknown, depth = 0): string {
  if (depth > 4) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractText(item, depth + 1)).filter(Boolean).join("\n");
  }

  if (!isRecord(value)) {
    return "";
  }

  for (const key of ["text", "message", "content", "delta"]) {
    const text = extractText(value[key], depth + 1);

    if (text) {
      return text;
    }
  }

  return "";
}

async function readOutputFile(outputPath: string) {
  try {
    return await fs.readFile(outputPath, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return "";
    }

    throw error;
  }
}

function formatCodexCommand(command: string, outputPath: string) {
  return command.replaceAll("{outputFile}", outputPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"'));
}

function extractCsv(output: string) {
  const trimmed = output.trim();
  const fenced = trimmed.match(/```(?:csv)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function generateFallbackRows(files: MarkdownPlanFile[]): ActivityRow[] {
  const rows: ActivityRow[] = [];

  for (const file of files) {
    let heading = "";

    for (const rawLine of file.content.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line) {
        continue;
      }

      if (line.startsWith("#")) {
        heading = line.replace(/^#+\s*/, "").trim();
        continue;
      }

      const task = cleanTaskLine(line);

      if (!task || task.length < 4) {
        continue;
      }

      rows.push(createFallbackRow(task, file.filename, heading, rows.length));
    }
  }

  if (rows.length === 0) {
    rows.push(createFallbackRow("Review uploaded markdown plan", "markdown_plan", "", 0));
  }

  return rows.slice(0, 250);
}

function createFallbackRow(task: string, source: string, heading: string, index: number): ActivityRow {
  const date = task.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? dateForOffset(index);
  const itemName = task.replace(/\d{4}-\d{2}-\d{2}/g, "").trim().slice(0, 220) || "Review uploaded plan item";

  return {
    row_id: "",
    date,
    category: inferCategory(task),
    item_type: inferItemType(task),
    item_name: itemName,
    difficulty: inferDifficulty(task),
    status: "not_started",
    time_spent_min: "",
    confidence: "",
    attempt_type: "",
    result: "",
    pattern: "",
    interview_relevance: "high",
    scheduled_date: date,
    completed_at: "",
    source,
    notes: heading ? `Imported from ${heading}` : "Imported from markdown plan"
  };
}

function cleanTaskLine(line: string) {
  return line
    .replace(/^- \[[ xX]\]\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCategory(task: string): ActivityRow["category"] {
  const value = task.toLowerCase();

  if (value.includes("two pointer")) return "two_pointers";
  if (value.includes("sliding")) return "sliding_window";
  if (value.includes("binary search")) return "binary_search";
  if (value.includes("linked list")) return "linked_list";
  if (value.includes("trie")) return "trie";
  if (value.includes("tree") || value.includes("bst")) return "trees";
  if (value.includes("heap") || value.includes("priority queue")) return "heap";
  if (value.includes("interval")) return "intervals";
  if (value.includes("backtrack")) return "backtracking";
  if (value.includes("graph")) return "graphs";
  if (value.includes("dp") || value.includes("dynamic programming")) return "dp_1d";
  if (value.includes("system design") || value.includes("design ")) return "system_design";
  if (value.includes("behavior") || value.includes("star") || value.includes("story")) return "behavioral";
  if (value.includes("review")) return "review";
  return "arrays_hashing";
}

function inferItemType(task: string): ActivityRow["item_type"] {
  const value = task.toLowerCase();

  if (value.includes("system design") || value.includes("design ")) return "system_design";
  if (value.includes("behavior") || value.includes("star") || value.includes("story")) return "behavioral";
  if (value.includes("review") || value.includes("redo") || value.includes("re-solve")) return "leetcode_review";
  if (value.includes("note")) return "notes_review";
  return "leetcode_new";
}

function inferDifficulty(task: string): ActivityRow["difficulty"] {
  const value = task.toLowerCase();

  if (value.includes("easy")) return "easy";
  if (value.includes("hard")) return "hard";
  if (value.includes("medium")) return "medium";
  return "";
}

function dateForOffset(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function uniquePlanId(name: string, existingPlans: PlanSummary[]) {
  const base = slugify(name) || "plan";
  const existingIds = new Set(existingPlans.map((plan) => plan.id));
  let candidate = base;
  let suffix = 2;

  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function sanitizeFilename(filename: string) {
  const sanitized = path.basename(String(filename || "plan.md")).replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized || "plan.md";
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function deleteTrackedPlanFile(filePath: string, dataRoot: string) {
  if (!filePath.trim()) {
    return;
  }

  const resolvedPath = path.resolve(filePath);
  if (!isPathInside(resolvedPath, dataRoot) && resolvedPath !== dataRoot) {
    throw new PlanStoreError(`Refusing to delete files outside the data directory: ${resolvedPath}`, 500);
  }

  await fs.rm(resolvedPath, { force: true });
}

function isPathInside(childPath: string, parentPath: string) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
