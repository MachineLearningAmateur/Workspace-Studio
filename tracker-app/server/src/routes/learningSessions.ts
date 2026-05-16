import { Router } from "express";
import { getLearningSessionJob, listLearningSessionJobsByScope, startLearningSessionJob } from "../services/learningSessionJobs.js";
import {
  applyLearningEvaluation,
  createLearningSessionFromScope,
  deleteLearningSession,
  getLearningSession,
  listLearningSessionsByScope,
  type LearningSessionEvaluation
} from "../services/learningSessionStore.js";

export const learningSessionsRouter = Router();

learningSessionsRouter.get("/", async (req, res, next) => {
  try {
    const planId = typeof req.query.planId === "string" ? req.query.planId : undefined;
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
    res.json(await listLearningSessionsByScope({ planId, workspaceId }));
  } catch (error) {
    next(error);
  }
});

learningSessionsRouter.post("/", async (req, res, next) => {
  try {
    const planId = String(req.body.planId ?? "").trim();
    const workspaceId = String(req.body.workspaceId ?? "").trim();
    const rowIndex = Number(req.body.rowIndex);
    const cardId = String(req.body.cardId ?? "").trim();

    if (planId && Number.isInteger(rowIndex)) {
      res.status(201).json(await createLearningSessionFromScope({ planId, rowIndex }));
      return;
    }

    if (workspaceId && cardId) {
      res.status(201).json(await createLearningSessionFromScope({ workspaceId, cardId }));
      return;
    }

    if ((!planId || !Number.isInteger(rowIndex)) && (!workspaceId || !cardId)) {
      res.status(400).json({ error: "Provide either planId and rowIndex, or workspaceId and cardId" });
      return;
    }
  } catch (error) {
    next(error);
  }
});

learningSessionsRouter.get("/jobs", (req, res) => {
  const planId = typeof req.query.planId === "string" ? req.query.planId : undefined;
  const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
  const activeOnly = req.query.active === "true" || req.query.active === "1";
  res.json(listLearningSessionJobsByScope({ planId, workspaceId, activeOnly }));
});

learningSessionsRouter.get("/jobs/:jobId", (req, res) => {
  const job = getLearningSessionJob(req.params.jobId);

  if (!job) {
    res.status(404).json({ error: `Learning session job not found: ${req.params.jobId}` });
    return;
  }

  res.json(job);
});

learningSessionsRouter.get("/:sessionId", async (req, res, next) => {
  try {
    res.json(await getLearningSession(req.params.sessionId));
  } catch (error) {
    next(error);
  }
});

learningSessionsRouter.delete("/:sessionId", async (req, res, next) => {
  try {
    res.json(await deleteLearningSession(req.params.sessionId));
  } catch (error) {
    next(error);
  }
});

learningSessionsRouter.post("/:sessionId/jobs", async (req, res, next) => {
  try {
    const type = req.body.type;

    if (type !== "draft_lesson" && type !== "message" && type !== "evaluation") {
      res.status(400).json({ error: "type must be draft_lesson, message, or evaluation" });
      return;
    }

    const job = await startLearningSessionJob({
      sessionId: req.params.sessionId,
      type,
      prompt: typeof req.body.prompt === "string" ? req.body.prompt : undefined
    });
    res.status(202).json(job);
  } catch (error) {
    next(error);
  }
});

learningSessionsRouter.post("/:sessionId/apply-evaluation", async (req, res, next) => {
  try {
    res.json(await applyLearningEvaluation(req.params.sessionId, req.body as LearningSessionEvaluation));
  } catch (error) {
    next(error);
  }
});
