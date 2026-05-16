import { Router } from "express";
import { createSource, deleteSource, listSources, SourceStoreError } from "../services/sourceStore.js";

export const sourcesRouter = Router();

sourcesRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listSources());
  } catch (error) {
    next(error);
  }
});

sourcesRouter.post("/", async (req, res, next) => {
  try {
    const source = await createSource(req.body);
    res.status(201).json(source);
  } catch (error) {
    next(error);
  }
});

sourcesRouter.delete("/:sourceId", async (req, res, next) => {
  try {
    const source = await deleteSource(req.params.sourceId);
    res.json(source);
  } catch (error) {
    next(error);
  }
});

export function isSourceStoreError(error: unknown): error is SourceStoreError {
  return error instanceof SourceStoreError;
}
