import { Router } from "express";
import {
  buildWorkspaceChatContext,
  createWorkspace,
  createWorkspaceCard,
  createWorkspaceSubject,
  deleteWorkspaceCard,
  deleteWorkspace,
  getWorkspace,
  getWorkspaceNotes,
  listWorkspaceCards,
  listWorkspaceSubjects,
  listWorkspaces,
  updateWorkspaceCard,
  updateWorkspaceNotesContent,
  WorkspaceStoreError
} from "../services/workspaceStore.js";
import { workspaceNotebookRouter } from "./workspaceNotebook.js";

export const workspacesRouter = Router();

workspacesRouter.use("/:workspaceId/notebook", workspaceNotebookRouter);

workspacesRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listWorkspaces());
  } catch (error) {
    next(error);
  }
});

workspacesRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createWorkspace(req.body));
  } catch (error) {
    next(error);
  }
});

workspacesRouter.delete("/:workspaceId", async (req, res, next) => {
  try {
    res.json(await deleteWorkspace(req.params.workspaceId));
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get("/:workspaceId", async (req, res, next) => {
  try {
    res.json(await getWorkspace(req.params.workspaceId));
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get("/:workspaceId/subjects", async (req, res, next) => {
  try {
    res.json(await listWorkspaceSubjects(req.params.workspaceId));
  } catch (error) {
    next(error);
  }
});

workspacesRouter.post("/:workspaceId/subjects", async (req, res, next) => {
  try {
    res.status(201).json(await createWorkspaceSubject(req.params.workspaceId, req.body));
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get("/:workspaceId/cards", async (req, res, next) => {
  try {
    res.json(await listWorkspaceCards(req.params.workspaceId));
  } catch (error) {
    next(error);
  }
});

workspacesRouter.post("/:workspaceId/cards", async (req, res, next) => {
  try {
    res.status(201).json(await createWorkspaceCard(req.params.workspaceId, req.body));
  } catch (error) {
    next(error);
  }
});

workspacesRouter.patch("/:workspaceId/cards/:cardId", async (req, res, next) => {
  try {
    res.json(await updateWorkspaceCard(req.params.workspaceId, req.params.cardId, req.body));
  } catch (error) {
    next(error);
  }
});

workspacesRouter.delete("/:workspaceId/cards/:cardId", async (req, res, next) => {
  try {
    res.json(await deleteWorkspaceCard(req.params.workspaceId, req.params.cardId));
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get("/:workspaceId/notes", async (req, res, next) => {
  try {
    res.json(await getWorkspaceNotes(req.params.workspaceId));
  } catch (error) {
    next(error);
  }
});

workspacesRouter.put("/:workspaceId/notes", async (req, res, next) => {
  try {
    res.json(await updateWorkspaceNotesContent(req.params.workspaceId, String(req.body.content ?? "")));
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get("/:workspaceId/chat-context", async (req, res, next) => {
  try {
    res.json(await buildWorkspaceChatContext(req.params.workspaceId));
  } catch (error) {
    next(error);
  }
});

export function isWorkspaceError(error: unknown) {
  return error instanceof WorkspaceStoreError;
}
