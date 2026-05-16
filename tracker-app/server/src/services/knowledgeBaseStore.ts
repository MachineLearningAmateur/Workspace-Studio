import fs from "node:fs/promises";
import path from "node:path";
import { getPlanDataDir } from "./planStore.js";

export interface KnowledgeBaseSnapshot {
  path: string;
  content: string;
  updated_at: string;
}

export class KnowledgeBaseStoreError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

export function getKnowledgeBasePath() {
  return path.join(getPlanDataDir(), "knowledge-base.md");
}

export async function getKnowledgeBaseSnapshot(): Promise<KnowledgeBaseSnapshot> {
  const knowledgeBasePath = getKnowledgeBasePath();
  const content = await readKnowledgeBase();
  let updatedAt = "";

  try {
    const stats = await fs.stat(knowledgeBasePath);
    updatedAt = stats.mtime.toISOString();
  } catch {
    updatedAt = "";
  }

  return {
    path: knowledgeBasePath,
    content,
    updated_at: updatedAt
  };
}

export async function getKnowledgeBaseContext() {
  const content = await readKnowledgeBase();
  return content.trim() || "No knowledge base has been built yet.";
}

export async function updateKnowledgeBaseFromEvaluation(input: {
  sessionTitle: string;
  taskName: string;
  category: string;
  evaluation: {
    status: string;
    confidence: string;
    time_spent_min: string;
    result: string;
    notes: string;
    strengths: string;
    weaknesses: string;
    next_focus: string;
  };
}) {
  const existingContent = await readKnowledgeBase();
  const entry = [
    `## ${new Date().toISOString()} - ${input.taskName}`,
    "",
    `- Session: ${input.sessionTitle}`,
    `- Category: ${input.category}`,
    `- Suggested status: ${input.evaluation.status || "not provided"}`,
    `- Confidence: ${input.evaluation.confidence || "not provided"}`,
    `- Result: ${input.evaluation.result || "not provided"}`,
    `- Time spent: ${input.evaluation.time_spent_min || "not provided"} minutes`,
    `- Strengths: ${input.evaluation.strengths || "not captured"}`,
    `- Weak areas: ${input.evaluation.weaknesses || "not captured"}`,
    `- Next focus: ${input.evaluation.next_focus || "not captured"}`,
    `- Tracker notes: ${input.evaluation.notes || "not captured"}`,
    ""
  ].join("\n");
  const nextContent = existingContent.trim()
    ? `${existingContent.trim()}\n\n${entry}`
    : `# Interview Prep Knowledge Base\n\n${entry}`;

  await writeKnowledgeBase(nextContent);
  return getKnowledgeBaseSnapshot();
}

export async function rebuildKnowledgeBaseFromEntries(entries: Array<{
  sessionTitle: string;
  taskName: string;
  category: string;
  evaluation: {
    status: string;
    confidence: string;
    time_spent_min: string;
    result: string;
    notes: string;
    strengths: string;
    weaknesses: string;
    next_focus: string;
  };
}>) {
  const body = entries
    .map((entry) =>
      [
        `## ${entry.taskName}`,
        "",
        `- Session: ${entry.sessionTitle}`,
        `- Category: ${entry.category}`,
        `- Suggested status: ${entry.evaluation.status || "not provided"}`,
        `- Confidence: ${entry.evaluation.confidence || "not provided"}`,
        `- Result: ${entry.evaluation.result || "not provided"}`,
        `- Time spent: ${entry.evaluation.time_spent_min || "not provided"} minutes`,
        `- Strengths: ${entry.evaluation.strengths || "not captured"}`,
        `- Weak areas: ${entry.evaluation.weaknesses || "not captured"}`,
        `- Next focus: ${entry.evaluation.next_focus || "not captured"}`,
        `- Tracker notes: ${entry.evaluation.notes || "not captured"}`,
        ""
      ].join("\n")
    )
    .join("\n");
  const content = `# Interview Prep Knowledge Base\n\n${body || "No approved learning evaluations yet."}`;
  await writeKnowledgeBase(content);
  return getKnowledgeBaseSnapshot();
}

async function readKnowledgeBase() {
  try {
    return await fs.readFile(getKnowledgeBasePath(), "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return "";
    }

    throw error;
  }
}

async function writeKnowledgeBase(content: string) {
  const knowledgeBasePath = getKnowledgeBasePath();
  await fs.mkdir(path.dirname(knowledgeBasePath), { recursive: true });
  await fs.writeFile(knowledgeBasePath, `${content.trim()}\n`, "utf8");
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
