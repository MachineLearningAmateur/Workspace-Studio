import { Router } from "express";
import {
  askCodexForWorkspaceNotebookCell,
  createWorkspaceNotebook,
  getWorkspaceNotebook,
  getWorkspaceNotebookById,
  listWorkspaceNotebooks,
  renameWorkspaceNotebook,
  runWorkspaceNotebookPythonCell,
  saveWorkspaceNotebook,
  deleteWorkspaceNotebook,
  WorkspaceNotebookStoreError
} from "../services/workspaceNotebookStore.js";

export const workspaceNotebookRouter = Router({ mergeParams: true });

workspaceNotebookRouter.get("/", async (req: { params: { workspaceId: string } }, res, next) => {
  try {
    res.json(await listWorkspaceNotebooks(req.params.workspaceId));
  } catch (error) {
    next(error);
  }
});

workspaceNotebookRouter.post("/", async (req: { params: { workspaceId: string }; body?: { name?: unknown } }, res, next) => {
  try {
    res.json(await createWorkspaceNotebook(req.params.workspaceId, { name: String(req.body?.name ?? "").trim() || "Untitled Notebook" }));
  } catch (error) {
    next(error);
  }
});

workspaceNotebookRouter.get("/:notebookId", async (req: { params: { workspaceId: string; notebookId: string } }, res, next) => {
  try {
    res.json(await getWorkspaceNotebookById(req.params.workspaceId, req.params.notebookId));
  } catch (error) {
    next(error);
  }
});

workspaceNotebookRouter.put(
  "/:notebookId",
  async (req: { params: { workspaceId: string; notebookId: string }; body?: { cells?: unknown } }, res, next) => {
    try {
      res.json(await saveWorkspaceNotebook(req.params.workspaceId, req.params.notebookId, { cells: req.body?.cells as never[] }));
    } catch (error) {
      next(error);
    }
  }
);

workspaceNotebookRouter.patch(
  "/:notebookId",
  async (req: { params: { workspaceId: string; notebookId: string }; body?: { name?: unknown } }, res, next) => {
    try {
      res.json(await renameWorkspaceNotebook(req.params.workspaceId, req.params.notebookId, { name: String(req.body?.name ?? "") }));
    } catch (error) {
      next(error);
    }
  }
);

workspaceNotebookRouter.delete("/:notebookId", async (req: { params: { workspaceId: string; notebookId: string } }, res, next) => {
  try {
    res.json(await deleteWorkspaceNotebook(req.params.workspaceId, req.params.notebookId));
  } catch (error) {
    next(error);
  }
});

workspaceNotebookRouter.post(
  "/:notebookId/cells/:cellId/run-python",
  async (req: { params: { workspaceId: string; notebookId: string; cellId: string } }, res, next) => {
    try {
      res.json(await runWorkspaceNotebookPythonCell(req.params.workspaceId, req.params.notebookId, req.params.cellId));
    } catch (error) {
      next(error);
    }
  }
);

workspaceNotebookRouter.post(
  "/:notebookId/cells/:cellId/ask-codex",
  async (req: { params: { workspaceId: string; notebookId: string; cellId: string } }, res, next) => {
    try {
      res.json(await askCodexForWorkspaceNotebookCell(req.params.workspaceId, req.params.notebookId, req.params.cellId));
    } catch (error) {
      next(error);
    }
  }
);

workspaceNotebookRouter.get("/default/current", async (req: { params: { workspaceId: string } }, res, next) => {
  try {
    res.json(await getWorkspaceNotebook(req.params.workspaceId));
  } catch (error) {
    next(error);
  }
});

export function isWorkspaceNotebookError(error: unknown) {
  return error instanceof WorkspaceNotebookStoreError;
}
