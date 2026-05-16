import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type ActivityRow, CsvStoreError, parseActivityCsv } from "./csvStore.js";
import { getPlanDataDir } from "./planStore.js";

export type ChatRole = "user" | "assistant";
export type ChatMode = "general" | "adaptive_progress";
export type CsvPreviewStatus = "valid" | "invalid";

export interface CsvPreview {
  id: string;
  status: CsvPreviewStatus;
  csv: string;
  rows: ActivityRow[];
  errors: string[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
  mode?: ChatMode;
  plan_id?: string;
  workspace_id?: string;
  source_ids?: string[];
  target_date?: string;
  preview?: CsvPreview;
}

export interface ChatSession {
  id: string;
  title: string;
  workspace_id?: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export class ChatStoreError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

export function getChatSessionsDir() {
  return path.join(getPlanDataDir(), "chat-sessions");
}

export async function listChatSessions(workspaceId?: string) {
  await ensureChatSessionsDir();
  const entries = await fs.readdir(getChatSessionsDir(), { withFileTypes: true });
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readSessionFile(path.join(getChatSessionsDir(), entry.name)))
  );
  await Promise.all(sessions.filter(normalizeGenericSessionTitle).map((session) => saveSession(session)));

  return sessions
    .filter((session) => (workspaceId ? session.workspace_id === workspaceId : true))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function createChatSession(input: { title?: string; workspaceId?: string } = {}) {
  const now = new Date().toISOString();
  const session: ChatSession = {
    id: randomUUID(),
    title: input.title?.trim() || "New chat",
    workspace_id: input.workspaceId?.trim() || undefined,
    created_at: now,
    updated_at: now,
    messages: []
  };

  await saveSession(session);
  return session;
}

export async function getChatSession(sessionId: string) {
  const session = await readSession(sessionId);
  return session;
}

export async function deleteChatSession(sessionId: string) {
  const session = await readSession(sessionId);
  await fs.rm(sessionPath(sessionId), { force: true });
  return session;
}

export async function retargetPlanChats(oldPlanId: string, oldWorkspaceId: string, newWorkspaceId: string) {
  await ensureChatSessionsDir();
  const entries = await fs.readdir(getChatSessionsDir(), { withFileTypes: true });
  let updatedSessions = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const session = await readSessionFile(path.join(getChatSessionsDir(), entry.name));
    let changed = false;

    if (session.workspace_id === oldWorkspaceId) {
      session.workspace_id = newWorkspaceId;
      changed = true;
    }

    for (const message of session.messages) {
      const matchedPlan = message.plan_id === oldPlanId;
      const matchedWorkspace = message.workspace_id === oldWorkspaceId;

      if (!matchedPlan && !matchedWorkspace) {
        continue;
      }

      if (matchedPlan) {
        message.plan_id = undefined;
      }

      if (matchedPlan || matchedWorkspace || !message.workspace_id) {
        message.workspace_id = newWorkspaceId;
      }

      changed = true;
    }

    if (changed) {
      session.updated_at = new Date().toISOString();
      if (!session.workspace_id) {
        session.workspace_id = newWorkspaceId;
      }
      await saveSession(session);
      updatedSessions += 1;
    }
  }

  return updatedSessions;
}

export async function addChatMessage(sessionId: string, message: Omit<ChatMessage, "id" | "created_at">) {
  const session = await readSession(sessionId);
  const now = new Date().toISOString();
  const nextMessage: ChatMessage = {
    id: randomUUID(),
    created_at: now,
    ...message
  };

  session.messages.push(nextMessage);
  session.updated_at = now;

  if (isGenericChatTitle(session.title) && message.role === "user") {
    session.title = titleFromPrompt(message.content);
  }

  await saveSession(session);
  return nextMessage;
}

export async function getChatMessage(sessionId: string, messageId: string) {
  const session = await readSession(sessionId);
  const message = session.messages.find((candidate) => candidate.id === messageId);

  if (!message) {
    throw new ChatStoreError(`Chat message not found: ${messageId}`, 404);
  }

  return message;
}

export function buildCsvPreview(content: string): CsvPreview | undefined {
  const csv = extractLastCsvBlock(content);

  if (!csv) {
    return undefined;
  }

  try {
    return {
      id: randomUUID(),
      status: "valid",
      csv,
      rows: parseActivityCsv(csv),
      errors: []
    };
  } catch (error) {
    return {
      id: randomUUID(),
      status: "invalid",
      csv,
      rows: [],
      errors: [error instanceof CsvStoreError || error instanceof Error ? error.message : String(error)]
    };
  }
}

async function readSession(sessionId: string) {
  try {
    const session = await readSessionFile(sessionPath(sessionId));

    if (normalizeGenericSessionTitle(session)) {
      await saveSession(session);
    }

    return session;
  } catch (error) {
    if (isFileNotFound(error)) {
      throw new ChatStoreError(`Chat session not found: ${sessionId}`, 404);
    }

    throw error;
  }
}

async function readSessionFile(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const session = JSON.parse(raw) as ChatSession;

  if (!session.id || !Array.isArray(session.messages)) {
    throw new ChatStoreError(`Malformed chat session file: ${filePath}`, 500);
  }

  if (!session.workspace_id) {
    session.workspace_id = session.messages.find((message) => message.workspace_id)?.workspace_id?.trim() || undefined;
  }

  return session;
}

async function saveSession(session: ChatSession) {
  await ensureChatSessionsDir();
  const targetPath = sessionPath(session.id);
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, targetPath);
}

async function ensureChatSessionsDir() {
  await fs.mkdir(getChatSessionsDir(), { recursive: true });
}

function sessionPath(sessionId: string) {
  return path.join(getChatSessionsDir(), `${safeId(sessionId)}.json`);
}

function extractLastCsvBlock(content: string) {
  const matches = Array.from(content.matchAll(/```csv\s*([\s\S]*?)```/gi));
  const lastMatch = matches.at(-1);
  return lastMatch?.[1]?.trim();
}

function normalizeGenericSessionTitle(session: ChatSession) {
  if (!isGenericChatTitle(session.title)) {
    return false;
  }

  const firstUserMessage = session.messages.find((message) => message.role === "user");

  if (!firstUserMessage) {
    if (session.title !== "New chat") {
      session.title = "New chat";
      return true;
    }

    return false;
  }

  session.title = titleFromPrompt(firstUserMessage.content);
  return true;
}

function isGenericChatTitle(title: string) {
  return ["codex chat", "codex prep chat", "new chat"].includes(title.trim().toLowerCase());
}

function titleFromPrompt(content: string) {
  const normalized = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_#[\]()>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(hi|hey|hello)\s+(codex|there)[,.:;!?]?\s+/i, "")
    .replace(/^(please\s+)?(can|could|would)\s+you\s+/i, "");

  return truncateAtWordBoundary(normalized || "Open chat", 72);
}

function truncateAtWordBoundary(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const truncated = value.slice(0, maxLength).trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");

  return `${(lastSpace > 32 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}...`;
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9-]/g, "");
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
