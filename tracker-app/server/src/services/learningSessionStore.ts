import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  results,
  statuses,
  type ActivityInput,
  type ActivityRowWithIndex,
  loadActivityRows,
  updateActivityRow
} from "./csvStore.js";
import { getKnowledgeBaseContext, rebuildKnowledgeBaseFromEntries, updateKnowledgeBaseFromEvaluation } from "./knowledgeBaseStore.js";
import { getPlanDataDir, getPlanById } from "./planStore.js";
import { listWorkspaceCards, updateWorkspaceCard, type WorkspaceCard } from "./workspaceStore.js";

export type LearningSessionStatus = "drafting" | "active" | "ready_for_review" | "completed";
export type LearningSessionRole = "user" | "codex";

export interface LearningSessionMessage {
  id: string;
  role: LearningSessionRole;
  content: string;
  created_at: string;
}

export interface LearningSessionEvaluation {
  status: string;
  confidence: string;
  time_spent_min: string;
  result: string;
  notes: string;
  strengths: string;
  weaknesses: string;
  next_focus: string;
}

export interface LearningSession {
  id: string;
  plan_id?: string;
  workspace_id?: string;
  row_index?: number;
  card_id?: string;
  title: string;
  status: LearningSessionStatus;
  row_snapshot?: ActivityRowWithIndex;
  card_snapshot?: WorkspaceCard;
  lesson_outline: string;
  messages: LearningSessionMessage[];
  evaluation?: LearningSessionEvaluation;
  approved_evaluation?: LearningSessionEvaluation;
  created_at: string;
  updated_at: string;
}

export class LearningSessionStoreError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

export function getLearningSessionsDir() {
  return path.join(getPlanDataDir(), "learning-sessions");
}

export async function listLearningSessions(planId?: string) {
  return listLearningSessionsByScope({ planId });
}

export async function listLearningSessionsByScope(input: { planId?: string; workspaceId?: string } = {}) {
  await ensureLearningSessionsDir();
  const entries = await fs.readdir(getLearningSessionsDir(), { withFileTypes: true });
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readSessionFile(path.join(getLearningSessionsDir(), entry.name)))
  );
  const filteredSessions = sessions.filter((session) => {
    if (input.planId && session.plan_id !== input.planId) {
      return false;
    }

    if (input.workspaceId && session.workspace_id !== input.workspaceId) {
      return false;
    }

    return true;
  });
  return filteredSessions.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function createLearningSession(input: { planId: string; rowIndex: number }) {
  return createLearningSessionFromScope(input);
}

export async function createLearningSessionFromScope(input: { planId: string; rowIndex: number } | { workspaceId: string; cardId: string }) {
  if ("planId" in input) {
    return createLearningSessionFromRow(input);
  }

  return createLearningSessionFromCard(input);
}

async function createLearningSessionFromRow(input: { planId: string; rowIndex: number }) {
  const plan = await getPlanById(input.planId);
  const rows = await loadActivityRows(plan.csv_path);
  const row = rows[input.rowIndex];

  if (!row) {
    throw new LearningSessionStoreError(`Tracker row not found for index ${input.rowIndex}`, 404);
  }

  const now = new Date().toISOString();
  const session: LearningSession = {
    id: randomUUID(),
    plan_id: plan.id,
    row_index: input.rowIndex,
    title: row.item_name,
    status: "drafting",
    row_snapshot: row,
    lesson_outline: "",
    messages: [],
    created_at: now,
    updated_at: now
  };

  await saveLearningSession(session);
  return session;
}

async function createLearningSessionFromCard(input: { workspaceId: string; cardId: string }) {
  const cards = await listWorkspaceCards(input.workspaceId);
  const card = cards.find((candidate) => candidate.id === input.cardId);

  if (!card) {
    throw new LearningSessionStoreError(`Workspace card not found: ${input.cardId}`, 404);
  }

  const now = new Date().toISOString();
  const session: LearningSession = {
    id: randomUUID(),
    workspace_id: input.workspaceId,
    card_id: card.id,
    title: card.title,
    status: "drafting",
    card_snapshot: card,
    lesson_outline: "",
    messages: [],
    created_at: now,
    updated_at: now
  };

  await saveLearningSession(session);
  return session;
}

export async function getLearningSession(sessionId: string) {
  return readLearningSession(sessionId);
}

export async function deleteLearningSession(sessionId: string) {
  const session = await readLearningSession(sessionId);
  await fs.rm(sessionPath(sessionId), { force: true });
  return session;
}

export async function retargetPlanLearningSessions(oldPlanId: string, newWorkspaceId: string) {
  await ensureLearningSessionsDir();
  const cards = await listWorkspaceCards(newWorkspaceId);
  const entries = await fs.readdir(getLearningSessionsDir(), { withFileTypes: true });
  let updatedSessions = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const session = await readSessionFile(path.join(getLearningSessionsDir(), entry.name));
    if (session.plan_id !== oldPlanId || !session.row_snapshot) {
      continue;
    }

    const card = findMigratedCardForLegacyRow(cards, session.row_snapshot);
    if (!card) {
      throw new LearningSessionStoreError(
        `Unable to retarget learning session "${session.id}" because no migrated card matched "${session.row_snapshot.item_name}".`,
        500
      );
    }

    session.plan_id = undefined;
    session.workspace_id = newWorkspaceId;
    session.row_index = undefined;
    session.row_snapshot = undefined;
    session.card_id = card.id;
    session.card_snapshot = card;
    session.title = card.title;
    session.updated_at = new Date().toISOString();
    await saveLearningSession(session);
    updatedSessions += 1;
  }

  return updatedSessions;
}

export async function addLearningMessage(sessionId: string, message: { role: LearningSessionRole; content: string }) {
  const session = await readLearningSession(sessionId);
  const now = new Date().toISOString();
  session.messages.push({
    id: randomUUID(),
    role: message.role,
    content: message.content,
    created_at: now
  });
  session.updated_at = now;
  if (session.status === "drafting") {
    session.status = "active";
  }
  await saveLearningSession(session);
  return session;
}

export async function setLearningLesson(sessionId: string, lesson: string) {
  const session = await readLearningSession(sessionId);
  const now = new Date().toISOString();
  session.lesson_outline = lesson;
  session.messages.push({
    id: randomUUID(),
    role: "codex",
    content: lesson,
    created_at: now
  });
  session.status = "active";
  session.updated_at = now;
  await saveLearningSession(session);
  return session;
}

export async function setLearningEvaluation(sessionId: string, evaluation: LearningSessionEvaluation, rawContent: string) {
  const session = await readLearningSession(sessionId);
  const now = new Date().toISOString();
  session.evaluation = evaluation;
  session.messages.push({
    id: randomUUID(),
    role: "codex",
    content: rawContent,
    created_at: now
  });
  session.status = "ready_for_review";
  session.updated_at = now;
  await saveLearningSession(session);
  return session;
}

export async function applyLearningEvaluation(sessionId: string, evaluation: LearningSessionEvaluation) {
  const session = await readLearningSession(sessionId);
  const normalizedEvaluation = normalizeEvaluation(evaluation);
  let updatedRow: ActivityRowWithIndex | undefined;
  let updatedCard: WorkspaceCard | undefined;

  if (session.plan_id && session.row_snapshot && typeof session.row_index === "number") {
    const rowSession = session as LearningSession & { row_index: number; row_snapshot: ActivityRowWithIndex };
    const plan = await getPlanById(session.plan_id);
    const currentRows = await loadActivityRows(plan.csv_path);
    const resolvedRowIndex = resolveCurrentRowIndex(rowSession, currentRows);
    const update: ActivityInput = {
      status: normalizedEvaluation.status,
      confidence: normalizedEvaluation.confidence,
      time_spent_min: normalizedEvaluation.time_spent_min,
      result: normalizedEvaluation.result,
      notes: normalizedEvaluation.notes
    };
    updatedRow = await updateActivityRow(resolvedRowIndex, update, plan.csv_path);
    session.row_index = resolvedRowIndex;
    session.row_snapshot = updatedRow;
  } else if (session.workspace_id && session.card_snapshot) {
    updatedCard = await updateWorkspaceCard(session.workspace_id, session.card_snapshot.id, {
      status: normalizedEvaluation.status,
      notes: normalizedEvaluation.notes
    });
    session.card_id = updatedCard.id;
    session.card_snapshot = updatedCard;
    session.title = updatedCard.title;
  } else {
    throw new LearningSessionStoreError(`Learning session ${sessionId} is missing a supported source target.`, 500);
  }

  session.approved_evaluation = normalizedEvaluation;
  session.status = "completed";
  session.updated_at = new Date().toISOString();
  await saveLearningSession(session);
  const knowledgeBase = await updateKnowledgeBaseFromEvaluation({
    sessionTitle: session.title,
    taskName: getSessionTaskName(session),
    category: getSessionCategory(session),
    evaluation: normalizedEvaluation
  });

  return {
    session,
    row: updatedRow,
    card: updatedCard,
    knowledgeBase
  };
}

function normalizeEvaluation(evaluation: LearningSessionEvaluation): LearningSessionEvaluation {
  const result = evaluation.result === "" || results.includes(evaluation.result as (typeof results)[number]) ? evaluation.result : "explained_only";

  return {
    status: normalizeEvaluationStatus(evaluation.status, result),
    confidence: /^[1-5]$/.test(evaluation.confidence) ? evaluation.confidence : "",
    time_spent_min: /^\d+$/.test(evaluation.time_spent_min) ? evaluation.time_spent_min : "",
    result,
    notes: evaluation.notes.trim(),
    strengths: evaluation.strengths.trim(),
    weaknesses: evaluation.weaknesses.trim(),
    next_focus: evaluation.next_focus.trim()
  };
}

function normalizeEvaluationStatus(status: string, result: string) {
  if (status === "in_progress") {
    if (result === "solved_alone" || result === "solved_with_hint" || result === "needed_solution") {
      return "done";
    }

    return "review_again";
  }

  return statuses.includes(status as (typeof statuses)[number]) ? status : "review_again";
}

function resolveCurrentRowIndex(session: LearningSession & { row_index: number; row_snapshot: ActivityRowWithIndex }, rows: ActivityRowWithIndex[]) {
  const indexedRow = rows[session.row_index];

  if (indexedRow && isSameTrackedRow(indexedRow, session.row_snapshot)) {
    return session.row_index;
  }

  const matchedRow = rows.find((row) => isSameTrackedRow(row, session.row_snapshot));

  if (!matchedRow) {
    throw new LearningSessionStoreError(
      `Tracker row no longer exists for "${session.row_snapshot.item_name}". The plan changed after this session was created.`,
      404
    );
  }

  return matchedRow.row_index;
}

function isSameTrackedRow(left: ActivityRowWithIndex, right: ActivityRowWithIndex) {
  return (
    left.date === right.date &&
    left.category === right.category &&
    left.item_type === right.item_type &&
    left.item_name === right.item_name &&
    left.source === right.source &&
    left.scheduled_date === right.scheduled_date
  );
}

function findMigratedCardForLegacyRow(cards: WorkspaceCard[], row: ActivityRowWithIndex) {
  return (
    cards.find((card) => card.id === row.row_id) ??
    cards.find(
      (card) =>
        card.title === row.item_name &&
        card.metadata.category === row.category &&
        card.metadata.item_type === row.item_type &&
        card.source === row.source &&
        card.metadata.scheduled_date === row.scheduled_date
    )
  );
}

export async function rebuildKnowledgeBaseFromLearningSessions() {
  const sessions = await listLearningSessions();
  return rebuildKnowledgeBaseFromEntries(
    sessions
      .filter((session) => session.approved_evaluation)
      .map((session) => ({
        sessionTitle: session.title,
        taskName: getSessionTaskName(session),
        category: getSessionCategory(session),
        evaluation: session.approved_evaluation as LearningSessionEvaluation
      }))
  );
}

export async function getLearningContextForPlan(planId: string) {
  const sessions = await listLearningSessions(planId);
  const relevantSessions = sessions.filter((session) => session.status === "ready_for_review" || session.status === "completed");
  const compactSessions = relevantSessions.map((session) => ({
    title: session.title,
    task: getSessionTaskName(session),
    category: getSessionCategory(session),
    status: session.status,
    evaluation: session.approved_evaluation ?? session.evaluation,
    recent_messages: session.messages.slice(-4).map((message) => ({
      role: message.role,
      content: message.content.slice(0, 1200)
    }))
  }));
  return {
    knowledge_base: await getKnowledgeBaseContext(),
    learning_sessions: compactSessions
  };
}

export async function saveLearningSession(session: LearningSession) {
  await ensureLearningSessionsDir();
  const targetPath = sessionPath(session.id);
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, targetPath);
}

async function readLearningSession(sessionId: string) {
  try {
    return await readSessionFile(sessionPath(sessionId));
  } catch (error) {
    if (isFileNotFound(error)) {
      throw new LearningSessionStoreError(`Learning session not found: ${sessionId}`, 404);
    }

    throw error;
  }
}

async function readSessionFile(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const session = JSON.parse(raw) as LearningSession;

  if (
    !session.id ||
    !Array.isArray(session.messages) ||
    (!session.plan_id && !session.workspace_id) ||
    (!session.row_snapshot && !session.card_snapshot)
  ) {
    throw new LearningSessionStoreError(`Malformed learning session file: ${filePath}`, 500);
  }

  return session;
}

async function ensureLearningSessionsDir() {
  await fs.mkdir(getLearningSessionsDir(), { recursive: true });
}

function sessionPath(sessionId: string) {
  return path.join(getLearningSessionsDir(), `${safeId(sessionId)}.json`);
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9-]/g, "");
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function getSessionTaskName(session: LearningSession) {
  if (session.row_snapshot) {
    return session.row_snapshot.item_name;
  }

  return session.card_snapshot?.title ?? session.title;
}

function getSessionCategory(session: LearningSession) {
  if (session.row_snapshot) {
    return session.row_snapshot.category;
  }

  return session.card_snapshot?.subject_id || session.card_snapshot?.source || "general";
}
