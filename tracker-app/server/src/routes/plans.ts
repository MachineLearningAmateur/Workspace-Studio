import { Router } from "express";
import { getPlanJob, startPlanJob } from "../services/planJobs.js";
import { createPlanFromMarkdown, deletePlan, listPlans, migratePlanToWorkspace } from "../services/planStore.js";

export const plansRouter = Router();

plansRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listPlans());
  } catch (error) {
    next(error);
  }
});

plansRouter.post("/", async (req, res, next) => {
  try {
    const plan = await createPlanFromMarkdown(req.body);
    res.status(201).json(plan);
  } catch (error) {
    next(error);
  }
});

plansRouter.post("/jobs", (req, res, next) => {
  try {
    const job = startPlanJob(req.body);
    res.status(202).json(job);
  } catch (error) {
    next(error);
  }
});

plansRouter.get("/jobs/:jobId", (req, res) => {
  const job = getPlanJob(req.params.jobId);

  if (!job) {
    res.status(404).json({ error: `Plan job not found: ${req.params.jobId}` });
    return;
  }

  res.json(job);
});

plansRouter.post("/:planId/migrate-to-workspace", async (req, res, next) => {
  try {
    res.json(await migratePlanToWorkspace(req.params.planId));
  } catch (error) {
    next(error);
  }
});

plansRouter.delete("/:planId", async (req, res, next) => {
  try {
    const deletedPlan = await deletePlan(req.params.planId);
    res.json(deletedPlan);
  } catch (error) {
    next(error);
  }
});
