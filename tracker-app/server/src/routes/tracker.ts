import { Router } from "express";
import {
  appendActivityRow,
  CsvStoreError,
  loadActivityRows,
  resetActivityRows,
  updateActivityRow
} from "../services/csvStore.js";

export const trackerRouter = Router();

trackerRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await loadActivityRows();
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

trackerRouter.post("/", async (req, res, next) => {
  try {
    const row = await appendActivityRow(req.body);
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

trackerRouter.put("/:rowIndex", async (req, res, next) => {
  try {
    const row = await updateActivityRow(Number(req.params.rowIndex), req.body);
    res.json(row);
  } catch (error) {
    next(error);
  }
});

trackerRouter.post("/reset", async (_req, res, next) => {
  try {
    const rows = await resetActivityRows();
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export function trackerErrorHandler(error: unknown, _req: unknown, res: { status: (code: number) => { json: (body: object) => void } }, _next: unknown) {
  if (error instanceof CsvStoreError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  res.status(500).json({ error: message });
}
