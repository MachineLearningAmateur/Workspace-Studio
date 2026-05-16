import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  addLearningMessage,
  getLearningSession,
  getLearningSessionsDir,
  saveLearningSession,
  type LearningSession,
  type LearningSessionEvaluation
} from "./learningSessionStore.js";
import { getProfileContext } from "./profileStore.js";
import { buildWorkspaceChatContext } from "./workspaceStore.js";

export type LearningSessionJobStatus = "queued" | "running" | "completed" | "failed";
export type LearningSessionJobType = "draft_lesson" | "message" | "evaluation";

export interface LearningSessionProgressMessage {
  timestamp: string;
  message: string;
}

export interface LearningSessionJobSnapshot {
  id: string;
  session_id: string;
  type: LearningSessionJobType;
  status: LearningSessionJobStatus;
  created_at: string;
  updated_at: string;
  messages: LearningSessionProgressMessage[];
  session?: LearningSession;
  error?: string;
}

interface LearningSessionJob extends LearningSessionJobSnapshot {
  input: {
    sessionId: string;
    type: LearningSessionJobType;
    prompt?: string;
  };
}

export class LearningSessionJobError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

const jobs = new Map<string, LearningSessionJob>();
const sessionJobTails = new Map<string, Promise<void>>();
const maxMessages = 100;
const defaultCodexSessionCommand =
  'codex exec --skip-git-repo-check --sandbox read-only --ephemeral --json --output-last-message "{outputFile}" -';

export async function startLearningSessionJob(input: { sessionId: string; type: LearningSessionJobType; prompt?: string }) {
  if (input.type === "message" && !input.prompt?.trim()) {
    throw new LearningSessionJobError("Prompt is required", 400);
  }

  const session = await getLearningSession(input.sessionId);

  const now = new Date().toISOString();
  const job: LearningSessionJob = {
    id: randomUUID(),
    session_id: input.sessionId,
    type: input.type,
    status: "queued",
    created_at: now,
    updated_at: now,
    messages: [],
    session,
    input
  };

  jobs.set(job.id, job);
  addProgress(job, `Queued ${input.type.replace(/_/g, " ")} job.`);
  enqueueLearningSessionJob(job);
  return snapshotJob(job);
}

export function getLearningSessionJob(jobId: string) {
  const job = jobs.get(jobId);
  return job ? snapshotJob(job) : null;
}

export function listLearningSessionJobs(input: { planId?: string; activeOnly?: boolean } = {}) {
  return listLearningSessionJobsByScope(input);
}

export function listLearningSessionJobsByScope(input: { planId?: string; workspaceId?: string; activeOnly?: boolean } = {}) {
  const activeStatuses = new Set<LearningSessionJobStatus>(["queued", "running"]);

  return Array.from(jobs.values())
    .filter((job) => {
      if (input.activeOnly && !activeStatuses.has(job.status)) {
        return false;
      }

      if (input.planId && job.session?.plan_id !== input.planId) {
        return false;
      }

      if (input.workspaceId && job.session?.workspace_id !== input.workspaceId) {
        return false;
      }

      return true;
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(snapshotJob);
}

function enqueueLearningSessionJob(job: LearningSessionJob) {
  const previousTail = sessionJobTails.get(job.session_id) ?? Promise.resolve();
  const run = previousTail.catch(() => undefined).then(() => runLearningSessionJob(job));
  const cleanup = run.finally(() => {
    if (sessionJobTails.get(job.session_id) === cleanup) {
      sessionJobTails.delete(job.session_id);
    }
  });

  sessionJobTails.set(job.session_id, cleanup);
}

async function runLearningSessionJob(job: LearningSessionJob) {
  job.status = "running";
  touch(job);
  addProgress(job, "Preparing learning session context.");

  try {
    const session =
      job.input.type === "message" && job.input.prompt
        ? await addLearningMessage(job.input.sessionId, {
            role: "user",
            content: job.input.prompt
          })
        : await getLearningSession(job.input.sessionId);
    job.session = session;
    const codexPrompt = await buildLearningPrompt(session, job.input.type, job.input.prompt);
    const outputPath = path.join(getLearningSessionsDir(), `${job.id}-codex-output.md`);
    const command = formatCodexCommand(process.env.CODEX_SESSION_COMMAND ?? defaultCodexSessionCommand, outputPath);
    const content =
      command.trim().toLowerCase() === "off"
        ? fallbackContent(session, job.input.type)
        : await runCommandWithStdin(command, codexPrompt, (message) => addProgress(job, message));
    const finalContent = command.trim().toLowerCase() === "off" ? content : (await readOutputFile(outputPath)) || content;

    job.session = await storeLearningSessionResponse(session, job.input.type, finalContent);

    job.status = "completed";
    addProgress(job, "Stored learning session response.");
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    addProgress(job, job.error);
  } finally {
    touch(job);
  }
}

async function storeLearningSessionResponse(session: LearningSession, type: LearningSessionJobType, content: string) {
  const now = new Date().toISOString();
  const nextSession: LearningSession = {
    ...session,
    messages: [...session.messages],
    updated_at: now
  };

  if (type === "draft_lesson") {
    nextSession.lesson_outline = content;
    nextSession.messages.push({
      id: randomUUID(),
      role: "codex",
      content,
      created_at: now
    });
    nextSession.status = "active";
  } else if (type === "evaluation") {
    nextSession.evaluation = parseEvaluation(content);
    nextSession.messages.push({
      id: randomUUID(),
      role: "codex",
      content,
      created_at: now
    });
    nextSession.status = "ready_for_review";
  } else {
    nextSession.messages.push({
      id: randomUUID(),
      role: "codex",
      content,
      created_at: now
    });

    if (nextSession.status === "drafting") {
      nextSession.status = "active";
    }
  }

  await saveLearningSession(nextSession);
  return nextSession;
}

async function buildLearningPrompt(session: LearningSession, type: LearningSessionJobType, prompt?: string) {
  const profileContext = await getProfileContext();
  const workspaceContext = session.workspace_id ? await buildWorkspaceChatContext(session.workspace_id) : null;
  const transcript = session.messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
  const learningTarget = session.row_snapshot ?? session.card_snapshot ?? { title: session.title };
  const baseContext = `You are Codex acting as an interview-prep tutor.

Use guided teaching with Socratic checkpoints. Be direct, practical, and interactive.
Do not overwhelm the learner. Keep each response focused on the current step.
Prefer short sections, concrete examples, and one question at a time.

Tracker task:
${JSON.stringify(learningTarget, null, 2)}

Current workspace board context:
${workspaceContext ? JSON.stringify(workspaceContext, null, 2) : "No workspace board context is attached to this session."}

Saved resume and user background context:
${profileContext}

Existing lesson outline:
${session.lesson_outline || "No outline yet."}

Transcript:
${transcript || "No transcript yet."}
`;

  if (type === "draft_lesson") {
    return `${baseContext}
Create the opening message for a step-by-step learning session.

Hard limits:
- Maximum 260 words.
- Do not include the full lesson, full worked example, full practice set, or full rubric.
- Do not list more than 4 roadmap steps.
- End with exactly one checkpoint question.

Format:
1. Start with a one-sentence objective.
2. Include "Goals" with 2-3 short bullets describing what the learner will be able to do.
3. Include "Roadmap" with 3-4 short steps.
4. Teach only "Step 1" in 2-4 concise bullets.
5. Ask one checkpoint question for the learner to answer before moving on.

The learner should feel guided, not lectured.`;
  }

  if (type === "evaluation") {
    return `${baseContext}
Evaluate the user's demonstrated understanding from this session.

Return a concise explanation, then include exactly one fenced json block with:
{
  "status": "done|review_again|skipped",
  "confidence": "1|2|3|4|5",
  "time_spent_min": "integer minutes or empty",
  "result": "solved_alone|solved_with_hint|needed_solution|partial|review_only|explained_only|empty string",
  "notes": "tracker note to save",
  "strengths": "what the user demonstrated",
  "weaknesses": "what remains shaky",
  "next_focus": "what to do next"
}

Status guidance:
- Use "done" when this learning session completed the planned attempt for the tracker task, even if hints were needed.
- Use "review_again" when the task was attempted but should not count as completed yet.
- Do not use "in_progress".`;
  }

  return `${baseContext}
User's latest message:
${prompt}

Continue the guided learning session.

Hard limits:
- Maximum 180 words unless the user explicitly asks for depth.
- Respond to the user's latest answer first.
- Teach or practice exactly one next step.
- Ask exactly one next question or give exactly one small exercise.
- Do not dump the remaining lesson plan.

If the user is confused, slow down and use a smaller example. If the user is correct, briefly confirm and move to the next step.`;
}

function parseEvaluation(content: string): LearningSessionEvaluation {
  const match = content.match(/```json\s*([\s\S]*?)```/i);
  const rawJson = match?.[1] ?? content;
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(rawJson.trim()) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  return {
    status: normalizeField(parsed.status, "review_again"),
    confidence: normalizeField(parsed.confidence, ""),
    time_spent_min: normalizeField(parsed.time_spent_min, ""),
    result: normalizeField(parsed.result, "explained_only"),
    notes: normalizeField(parsed.notes, content.trim().slice(0, 600)),
    strengths: normalizeField(parsed.strengths, ""),
    weaknesses: normalizeField(parsed.weaknesses, ""),
    next_focus: normalizeField(parsed.next_focus, "")
  };
}

function normalizeField(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  if (value === "empty string") {
    return "";
  }

  return value.trim();
}

function fallbackContent(session: LearningSession, type: LearningSessionJobType) {
  const taskName = session.row_snapshot?.item_name ?? session.card_snapshot?.title ?? session.title;

  if (type === "evaluation") {
    return `Evaluation fallback.

\`\`\`json
{
  "status": "review_again",
  "confidence": "",
  "time_spent_min": "",
  "result": "explained_only",
  "notes": "Completed a guided review session for ${escapeJson(taskName)}.",
  "strengths": "Session reviewed the topic.",
  "weaknesses": "Codex session command is disabled, so no detailed assessment was produced.",
  "next_focus": "Repeat the session with Codex enabled."
}
\`\`\``;
  }

  if (type === "draft_lesson") {
    return `# ${taskName}

Objective: Build a working understanding of this task one step at a time.

Roadmap:
1. Clarify the core idea.
2. Work through one small example.
3. Practice the pattern.
4. Review what still feels shaky.

Goals:
- Explain the task in plain language.
- Identify the key success criteria.
- Know what to practice next.

Step 1:
- Identify what the task is really asking.
- Name the inputs, outputs, and success criteria.
- Separate facts from assumptions.

Checkpoint: In one or two sentences, what do you think this task is asking you to learn or demonstrate?`;
  }

  return "Codex session command is disabled. Give one short answer about what you understand so far, and I will guide the next step when Codex is enabled.";
}

function runCommandWithStdin(command: string, input: string, onProgress?: (message: string) => void) {
  const timeoutMs = Number(process.env.CODEX_SESSION_TIMEOUT_MS ?? 120_000);

  return new Promise<string>((resolve, reject) => {
    onProgress?.(`Starting Codex session command: ${command}`);
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
    if (!trimmed) continue;

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
    return "Codex started the tutoring turn.";
  }

  if (type === "turn.completed") {
    return "Codex finished the tutoring turn.";
  }

  if (type === "error") {
    return extractText(event) || "Codex reported an error.";
  }

  if (type.includes("delta")) {
    const text = extractText(event);
    return text ? `Codex draft fragment: ${compactText(text)}` : null;
  }

  const item = isRecord(event.item) ? event.item : undefined;
  const itemType = item && typeof item.type === "string" ? item.type : "";
  const itemRole = item && typeof item.role === "string" ? item.role : "";

  if (type === "item.started" && itemType) {
    return `Codex started ${labelCodexItem(itemType)}.`;
  }

  if (type === "item.completed" && itemType) {
    const text = itemRole === "user" ? "" : extractText(item);
    if (text) {
      return `Codex response preview: ${compactText(text)}`;
    }

    return `Codex completed ${labelCodexItem(itemType)}.`;
  }

  return null;
}

function labelCodexItem(itemType: string) {
  return itemType.replace(/_/g, " ");
}

function compactText(value: string) {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > 900 ? `${compacted.slice(0, 900)}...` : compacted;
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

  for (const key of ["text", "message", "content", "delta", "output"]) {
    const text = extractText(value[key], depth + 1);

    if (text) {
      return text;
    }
  }

  return "";
}

function addProgress(job: LearningSessionJob, message: string) {
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

function snapshotJob(job: LearningSessionJob): LearningSessionJobSnapshot {
  return {
    id: job.id,
    session_id: job.session_id,
    type: job.type,
    status: job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
    messages: [...job.messages],
    session: job.session,
    error: job.error
  };
}

function touch(job: LearningSessionJob) {
  job.updated_at = new Date().toISOString();
}

async function readOutputFile(outputPath: string) {
  try {
    return await fs.readFile(outputPath, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) return "";
    throw error;
  }
}

function formatCodexCommand(command: string, outputPath: string) {
  return command.replaceAll("{outputFile}", outputPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"'));
}

function escapeJson(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
