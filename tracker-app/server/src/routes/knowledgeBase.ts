import { Router } from "express";
import { getKnowledgeBaseSnapshot } from "../services/knowledgeBaseStore.js";
import { rebuildKnowledgeBaseFromLearningSessions } from "../services/learningSessionStore.js";

export const knowledgeBaseRouter = Router();

knowledgeBaseRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getKnowledgeBaseSnapshot());
  } catch (error) {
    next(error);
  }
});

knowledgeBaseRouter.post("/rebuild", async (_req, res, next) => {
  try {
    res.json(await rebuildKnowledgeBaseFromLearningSessions());
  } catch (error) {
    next(error);
  }
});
