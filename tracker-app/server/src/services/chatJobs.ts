import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type ActivityRowWithIndex, loadActivityRows } from "./csvStore.js";
import {
  addChatMessage,
  buildCsvPreview,
  createChatSession,
  getChatSession,
  getChatSessionsDir,
  type ChatMode,
  type ChatMessage
} from "./chatStore.js";
import { getLearningContextForPlan } from "./learningSessionStore.js";
import { getPlanById } from "./planStore.js";
import { getProfileContext } from "./profileStore.js";
import { getSourcesByIds } from "./sourceStore.js";
import { buildWorkspaceChatContext } from "./workspaceStore.js";

export type ChatJobStatus = "queued" | "running" | "completed" | "failed";

export interface ChatProgressMessage {
  timestamp: string;
  message: string;
}

export interface ChatJobSnapshot {
  id: string;
  session_id: string;
  status: ChatJobStatus;
  created_at: string;
  updated_at: string;
  messages: ChatProgressMessage[];
  assistant_message?: ChatMessage;
  error?: string;
}

export interface StartChatJobInput {
  sessionId?: string;
  prompt: string;
  mode?: ChatMode;
  planId?: string;
  workspaceId?: string;
  sourceIds?: string[];
  attachments?: ChatAttachment[];
  targetDate?: string;
}

export interface ChatAttachment {
  filename: string;
  content: string;
}

interface ChatJob extends ChatJobSnapshot {
  input: Required<Pick<StartChatJobInput, "prompt">> & Omit<StartChatJobInput, "prompt">;
}

const jobs = new Map<string, ChatJob>();
const maxMessages = 100;
const defaultCodexChatCommand =
  'codex exec --skip-git-repo-check --sandbox read-only --ephemeral --json --output-last-message "{outputFile}" -';

export async function startChatJob(input: StartChatJobInput) {
  const prompt = String(input.prompt ?? "");

  if (!prompt.trim()) {
    throw new ChatJobError("Prompt is required", 400);
  }

  const session = input.sessionId
    ? { id: input.sessionId }
    : await createChatSession({ title: prompt.trim().slice(0, 80), workspaceId: input.workspaceId });
  await addChatMessage(session.id, {
    role: "user",
    content: prompt,
    mode: input.mode ?? "general",
    plan_id: input.planId,
    workspace_id: input.workspaceId,
    source_ids: input.sourceIds ?? [],
    target_date: input.targetDate
  });

  const now = new Date().toISOString();
  const job: ChatJob = {
    id: randomUUID(),
    session_id: session.id,
    status: "queued",
    created_at: now,
    updated_at: now,
    messages: [],
    input: {
      ...input,
      prompt,
      sessionId: session.id,
      mode: input.mode ?? "general",
      sourceIds: input.sourceIds ?? [],
      attachments: normalizeAttachments(input.attachments)
    }
  };

  jobs.set(job.id, job);
  addProgress(job, "Queued Codex chat request.");
  void runChatJob(job);
  return snapshotJob(job);
}

export function getChatJob(jobId: string) {
  const job = jobs.get(jobId);
  return job ? snapshotJob(job) : null;
}

export class ChatJobError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

async function runChatJob(job: ChatJob) {
  job.status = "running";
  touch(job);
  addProgress(job, "Preparing Codex context.");

  try {
    const codexPrompt = await buildCodexPrompt(job.input);
    const outputPath = path.join(getChatSessionsDir(), `${job.id}-codex-output.md`);
    const command = formatCodexCommand(process.env.CODEX_CHAT_COMMAND ?? defaultCodexChatCommand, outputPath);
    const content =
      command.trim().toLowerCase() === "off"
        ? "Codex chat is disabled with CODEX_CHAT_COMMAND=off."
        : await runCommandWithStdin(command, codexPrompt, (message) => addProgress(job, message));
    const finalContent = command.trim().toLowerCase() === "off" ? content : (await readOutputFile(outputPath)) || content;
    const assistantMessage = await addChatMessage(job.session_id, {
      role: "assistant",
      content: finalContent,
      mode: job.input.mode,
      plan_id: job.input.planId,
      workspace_id: job.input.workspaceId,
      source_ids: job.input.sourceIds,
      target_date: job.input.targetDate,
      preview: buildCsvPreview(finalContent)
    });

    job.assistant_message = assistantMessage;
    job.status = "completed";
    addProgress(job, assistantMessage.preview ? "Stored assistant response with CSV preview." : "Stored assistant response.");
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    addProgress(job, job.error);
  } finally {
    touch(job);
  }
}

async function buildCodexPrompt(input: StartChatJobInput) {
  const mode = input.mode ?? "general";
  const sourceContext = input.sourceIds?.length ? await buildSourceContext(input.sourceIds) : "No markdown sources selected.";
  const attachmentContext = input.attachments?.length ? buildAttachmentContext(input.attachments) : "No one-off markdown attachments included.";
  const profileContext = await getProfileContext();
  const planContext = input.planId ? await buildPlanContext(input.planId, mode) : "No tracker plan selected.";
  const workspaceContext = input.workspaceId ? await buildWorkspaceContext(input.workspaceId) : "No workspace selected.";
  const conversationContext = input.sessionId ? await buildConversationContext(input.sessionId) : `USER:\n${input.prompt}`;
  const targetDate = input.targetDate?.trim() || "No target date provided.";
  const adaptiveInstructions =
    mode === "adaptive_progress"
      ? `\nAdaptive planning mode:\n- Review completed work and weak signals from tracker history.\n- Optimize for interview readiness and the target date.\n- Prioritize high-relevance gaps, low confidence, skipped/review_again rows, hints, needed solutions, and notes.\n- Include a concise rationale before any CSV.\n`
      : "";

  return `You are Codex working inside a local interview-prep tracker.

Treat this as an open-ended chat session. Answer the user directly, continue from the prior conversation, and use Markdown whenever it helps with notes, explanations, outlines, checklists, or lightweight plans.

Use only the context included in this prompt. Do not run shell commands, inspect the filesystem, read local files, write files, call APIs, or try to modify the app directly. The tracker app will handle persistence after your response.

Only create or revise a tracker CSV when the user explicitly asks for a tracker plan, schedule, curriculum, or plan update that should be saved in the app. When the user asks to add a plan, create the CSV preview only; the app will show save actions for valid previews. When you do create or revise a tracker plan, include a concise Markdown explanation and then include the tracker data as a fenced csv block using this exact header:
date,category,item_type,item_name,difficulty,status,time_spent_min,confidence,attempt_type,result,pattern,interview_relevance,scheduled_date,completed_at,source,notes

Plan update rules:
- If the user asks to remove, delete, clear, or drop tasks from the active/current/selected plan, output a complete replacement CSV for that selected plan, not just the rows being changed.
- For those removal requests, hard-delete matching rows only when the row is not completed yet.
- Treat a row as already completed if status is done or completed_at is non-empty.
- Preserve already completed rows even if they otherwise match the removal request.
- Do not mark rows as skipped as a substitute for deletion when the user asked for removal.
- In the explanation before the CSV, state that pending rows were removed from the plan and completed rows were preserved when applicable.

CSV formatting rules:
- The fenced csv block must contain only valid RFC 4180 CSV rows.
- Every row must have exactly 16 fields matching the header.
- Quote any field that contains a comma, double quote, or newline.
- Escape a double quote inside a quoted field by writing two double quotes.
- Keep notes concise; avoid commas in notes unless the entire notes field is quoted.
- Use YYYY-MM-DD for date. Use YYYY-MM-DD or YYYY-MM-DDTHH:mm for scheduled_date. Leave completed_at empty for future planned work.

Allowed values:
- category: arrays_hashing, two_pointers, stack, sliding_window, binary_search, linked_list, trees, trie, heap, intervals, backtracking, graphs, dp_1d, system_design, behavioral, review
- item_type: leetcode_new, leetcode_review, system_design, behavioral, notes_review
- difficulty: empty, easy, medium, hard
- status: not_started, in_progress, done, review_again, skipped
- attempt_type: empty, first_try, re_solve, timed, mock
- result: empty, solved_alone, solved_with_hint, needed_solution, partial, review_only, explained_only
- interview_relevance: high, medium, low
${adaptiveInstructions}
Target date: ${targetDate}

Selected tracker context:
${planContext}

Selected workspace context:
${workspaceContext}

Saved resume and user background context:
${profileContext}

Selected markdown sources:
${sourceContext}

One-off markdown attachments for this request:
${attachmentContext}

Conversation so far, including the latest user request:
${conversationContext}

Current user request:
${input.prompt}
`;
}

async function buildSourceContext(sourceIds: string[]) {
  const sources = await getSourcesByIds(sourceIds);
  return sources.map(({ source, content }) => `## ${source.filename}\n\n${content}`).join("\n\n---\n\n");
}

function buildAttachmentContext(attachments: ChatAttachment[]) {
  return normalizeAttachments(attachments).map((attachment) => `## ${attachment.filename}\n\n${attachment.content}`).join("\n\n---\n\n");
}

function normalizeAttachments(attachments: ChatAttachment[] | undefined) {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .map((attachment) => ({
      filename: String(attachment?.filename ?? "attachment.md").trim() || "attachment.md",
      content: String(attachment?.content ?? "")
    }))
    .filter((attachment) => attachment.content.trim());
}

async function buildConversationContext(sessionId: string) {
  const session = await getChatSession(sessionId);
  const messages = session.messages.slice(-16);

  if (messages.length === 0) {
    return "No prior conversation.";
  }

  return messages
    .map((message) => {
      const role = message.role === "assistant" ? "CODEX" : "USER";
      return `${role} (${message.created_at}):\n${truncateForPrompt(message.content, 6_000)}`;
    })
    .join("\n\n---\n\n");
}

async function buildPlanContext(planId: string, mode: ChatMode) {
  const plan = await getPlanById(planId);
  const rows = await loadActivityRows(plan.csv_path);
  const contextRows = mode === "adaptive_progress" ? rows.filter(isRelevantProgressRow) : rows;
  const learningContext = await getLearningContextForPlan(plan.id);

  return JSON.stringify(
    {
      plan: {
        id: plan.id,
        name: plan.name,
        revision_status: plan.revision_status,
        revision_message: plan.revision_message
      },
      rows: contextRows,
      learning_context: learningContext
    },
    null,
    2
  );
}

async function buildWorkspaceContext(workspaceId: string) {
  return JSON.stringify(await buildWorkspaceChatContext(workspaceId), null, 2);
}

function isRelevantProgressRow(row: ActivityRowWithIndex) {
  const confidence = Number(row.confidence);
  const lowConfidence = Number.isFinite(confidence) && confidence > 0 && confidence <= 2;
  return (
    row.status === "done" ||
    row.status === "review_again" ||
    row.status === "skipped" ||
    lowConfidence ||
    row.result === "solved_with_hint" ||
    row.result === "needed_solution"
  );
}

function truncateForPrompt(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}\n[truncated]`;
}

function runCommandWithStdin(command: string, input: string, onProgress?: (message: string) => void) {
  const timeoutMs = Number(process.env.CODEX_CHAT_TIMEOUT_MS ?? 120_000);

  return new Promise<string>((resolve, reject) => {
    onProgress?.(`Starting Codex chat command: ${command}`);
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

  if (type === "turn.started") return "Codex started working.";
  if (type === "turn.completed") return "Codex finished a turn.";
  if (type === "error") return extractText(event) || "Codex reported an error.";

  const item = isRecord(event.item) ? event.item : undefined;
  const itemType = item && typeof item.type === "string" ? item.type : "";

  if (type === "item.started" && itemType) return `Codex started ${itemType.replace(/_/g, " ")}.`;
  if (type === "item.completed" && itemType === "message") {
    const text = extractText(item);
    const lineCount = text ? text.split(/\r?\n/).filter(Boolean).length : 0;
    return lineCount > 1 ? `Codex produced ${lineCount.toLocaleString()} lines.` : text || "Codex produced a response.";
  }
  if (type === "item.completed" && itemType) return `Codex completed ${itemType.replace(/_/g, " ")}.`;
  return null;
}

function addProgress(job: ChatJob, message: string) {
  const normalizedMessage = message.trim();

  if (!normalizedMessage) return;

  job.messages.push({
    timestamp: new Date().toISOString(),
    message: normalizedMessage
  });

  if (job.messages.length > maxMessages) {
    job.messages.splice(0, job.messages.length - maxMessages);
  }

  touch(job);
}

function snapshotJob(job: ChatJob): ChatJobSnapshot {
  return {
    id: job.id,
    session_id: job.session_id,
    status: job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
    messages: [...job.messages],
    assistant_message: job.assistant_message,
    error: job.error
  };
}

function touch(job: ChatJob) {
  job.updated_at = new Date().toISOString();
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

function extractText(value: unknown, depth = 0): string {
  if (depth > 4) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => extractText(item, depth + 1)).filter(Boolean).join("\n");
  if (!isRecord(value)) return "";

  for (const key of ["text", "message", "content", "delta"]) {
    const text = extractText(value[key], depth + 1);
    if (text) return text;
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
