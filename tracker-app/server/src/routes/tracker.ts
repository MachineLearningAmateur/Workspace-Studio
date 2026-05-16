import { Router } from "express";
import { ChatJobError } from "../services/chatJobs.js";
import { ChatStoreError } from "../services/chatStore.js";
import { CodeVisualizationError } from "../services/codeVisualizationStore.js";
import {
  appendActivityRow,
  CsvStoreError,
  deleteActivityRow,
  loadActivityRows,
  resetActivityRows,
  updateActivityRow
} from "../services/csvStore.js";
import { JobApplicationStoreError } from "../services/jobApplicationStore.js";
import { KnowledgeBaseStoreError } from "../services/knowledgeBaseStore.js";
import { LearningSessionJobError } from "../services/learningSessionJobs.js";
import { LearningSessionStoreError } from "../services/learningSessionStore.js";
import { getPlanCsvPath, PlanStoreError } from "../services/planStore.js";
import { ProfileStoreError } from "../services/profileStore.js";
import { SourceStoreError } from "../services/sourceStore.js";
import { WorkspaceNotebookStoreError } from "../services/workspaceNotebookStore.js";
import { WorkspaceStoreError } from "../services/workspaceStore.js";

export const trackerRouter = Router();

trackerRouter.get("/", async (req, res, next) => {
  try {
    const rows = await loadActivityRows(await getRequestCsvPath(req));
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

trackerRouter.post("/", async (req, res, next) => {
  try {
    const row = await appendActivityRow(req.body, await getRequestCsvPath(req));
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

trackerRouter.put("/:rowIndex", async (req, res, next) => {
  try {
    const row = await updateActivityRow(Number(req.params.rowIndex), req.body, await getRequestCsvPath(req));
    res.json(row);
  } catch (error) {
    next(error);
  }
});

trackerRouter.delete("/:rowIndex", async (req, res, next) => {
  try {
    const row = await deleteActivityRow(Number(req.params.rowIndex), await getRequestCsvPath(req));
    res.json(row);
  } catch (error) {
    next(error);
  }
});

trackerRouter.post("/reset", async (req, res, next) => {
  try {
    const rows = await resetActivityRows(await getRequestCsvPath(req));
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

async function getRequestCsvPath(req: { query: Record<string, unknown> }) {
  const planId = typeof req.query.planId === "string" ? req.query.planId : undefined;
  if (!planId?.trim()) {
    throw new PlanStoreError("planId is required", 400);
  }
  return getPlanCsvPath(planId);
}

export function trackerErrorHandler(error: unknown, _req: unknown, res: { status: (code: number) => { json: (body: object) => void } }, _next: unknown) {
  if (
    error instanceof CsvStoreError ||
    error instanceof PlanStoreError ||
    error instanceof SourceStoreError ||
    error instanceof ChatStoreError ||
    error instanceof ChatJobError ||
    error instanceof CodeVisualizationError ||
    error instanceof JobApplicationStoreError ||
    error instanceof LearningSessionStoreError ||
    error instanceof LearningSessionJobError ||
    error instanceof KnowledgeBaseStoreError ||
    error instanceof ProfileStoreError ||
    error instanceof WorkspaceNotebookStoreError ||
    error instanceof WorkspaceStoreError
  ) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  res.status(500).json({ error: message });
}
