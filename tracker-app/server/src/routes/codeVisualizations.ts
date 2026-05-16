import { Router } from "express";
import { createCodeVisualization, CodeVisualizationError } from "../services/codeVisualizationStore.js";

export const codeVisualizationsRouter = Router();

codeVisualizationsRouter.post("/", async (req, res, next) => {
  try {
    res.json(await createCodeVisualization(req.body));
  } catch (error) {
    next(error);
  }
});

export function isCodeVisualizationError(error: unknown) {
  return error instanceof CodeVisualizationError;
}
