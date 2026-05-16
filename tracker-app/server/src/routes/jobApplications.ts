import { Router } from "express";
import {
  createJobApplication,
  deleteJobApplication,
  JobApplicationStoreError,
  listJobApplications,
  updateJobApplication,
  updateJobApplicationStatus
} from "../services/jobApplicationStore.js";

export const jobApplicationsRouter = Router();

jobApplicationsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listJobApplications());
  } catch (error) {
    next(error);
  }
});

jobApplicationsRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createJobApplication(req.body));
  } catch (error) {
    next(error);
  }
});

jobApplicationsRouter.put("/:id", async (req, res, next) => {
  try {
    res.json(await updateJobApplication(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
});

jobApplicationsRouter.put("/:id/status", async (req, res, next) => {
  try {
    res.json(await updateJobApplicationStatus(req.params.id, String(req.body.status ?? "")));
  } catch (error) {
    next(error);
  }
});

jobApplicationsRouter.delete("/:id", async (req, res, next) => {
  try {
    res.json(await deleteJobApplication(req.params.id));
  } catch (error) {
    next(error);
  }
});

export function isJobApplicationError(error: unknown) {
  return error instanceof JobApplicationStoreError;
}
