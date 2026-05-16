import { Router } from "express";
import { getChatJob, startChatJob, ChatJobError } from "../services/chatJobs.js";
import {
  ChatStoreError,
  createChatSession,
  deleteChatSession,
  getChatMessage,
  getChatSession,
  listChatSessions
} from "../services/chatStore.js";
import { appendPlanRows, createPlanFromRows, replacePlanRows } from "../services/planStore.js";

export const chatRouter = Router();

chatRouter.get("/sessions", async (req, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
    res.json(await listChatSessions(workspaceId));
  } catch (error) {
    next(error);
  }
});

chatRouter.post("/sessions", async (req, res, next) => {
  try {
    const session = await createChatSession({
      title: typeof req.body?.title === "string" ? req.body.title : undefined,
      workspaceId: typeof req.body?.workspaceId === "string" ? req.body.workspaceId : undefined
    });
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

chatRouter.get("/sessions/:sessionId", async (req, res, next) => {
  try {
    res.json(await getChatSession(req.params.sessionId));
  } catch (error) {
    next(error);
  }
});

chatRouter.delete("/sessions/:sessionId", async (req, res, next) => {
  try {
    res.json(await deleteChatSession(req.params.sessionId));
  } catch (error) {
    next(error);
  }
});

chatRouter.post("/jobs", async (req, res, next) => {
  try {
    const job = await startChatJob(req.body);
    res.status(202).json(job);
  } catch (error) {
    next(error);
  }
});

chatRouter.get("/jobs/:jobId", (req, res) => {
  const job = getChatJob(req.params.jobId);

  if (!job) {
    res.status(404).json({ error: `Chat job not found: ${req.params.jobId}` });
    return;
  }

  res.json(job);
});

chatRouter.post("/sessions/:sessionId/messages/:messageId/save-preview", async (req, res, next) => {
  try {
    const message = await getChatMessage(req.params.sessionId, req.params.messageId);

    if (!message.preview || message.preview.status !== "valid") {
      res.status(400).json({ error: "Message does not have a valid CSV preview" });
      return;
    }

    if (req.body.action === "replace_plan") {
      if (!req.body.planId) {
        res.status(400).json({ error: "planId is required for replace_plan" });
        return;
      }

      res.json(await replacePlanRows(String(req.body.planId), message.preview.rows));
      return;
    }

    if (req.body.action === "append_plan") {
      if (!req.body.planId) {
        res.status(400).json({ error: "planId is required for append_plan" });
        return;
      }

      res.json(await appendPlanRows(String(req.body.planId), message.preview.rows));
      return;
    }

    if (req.body.action === "new_plan") {
      const name = String(req.body.planName ?? "").trim();

      if (!name) {
        res.status(400).json({ error: "planName is required for new_plan" });
        return;
      }

      res.status(201).json(
        await createPlanFromRows({
          name,
          basePlanId: req.body.basePlanId ? String(req.body.basePlanId) : undefined,
          rows: message.preview.rows,
          revisionMessage: "Created from Codex chat CSV preview."
        })
      );
      return;
    }

    res.status(400).json({ error: "action must be new_plan, replace_plan, or append_plan" });
  } catch (error) {
    next(error);
  }
});

export function isChatError(error: unknown) {
  return error instanceof ChatStoreError || error instanceof ChatJobError;
}
