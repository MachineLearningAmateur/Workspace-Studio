import { randomUUID } from "node:crypto";
import { createPlanFromMarkdown, type CreatePlanInput, type PlanProgressMessage, type PlanSummary } from "./planStore.js";

export type PlanJobStatus = "queued" | "running" | "completed" | "failed";

export interface PlanJobSnapshot {
  id: string;
  status: PlanJobStatus;
  created_at: string;
  updated_at: string;
  messages: PlanProgressMessage[];
  plan?: PlanSummary;
  error?: string;
}

interface PlanJob extends PlanJobSnapshot {
  input: CreatePlanInput;
}

const jobs = new Map<string, PlanJob>();
const maxMessages = 80;

export function startPlanJob(input: CreatePlanInput) {
  const now = new Date().toISOString();
  const job: PlanJob = {
    id: randomUUID(),
    status: "queued",
    created_at: now,
    updated_at: now,
    messages: [],
    input
  };

  jobs.set(job.id, job);
  addMessage(job, "Queued plan creation.");
  void runPlanJob(job);
  return snapshotJob(job);
}

export function getPlanJob(jobId: string) {
  const job = jobs.get(jobId);

  if (!job) {
    return null;
  }

  return snapshotJob(job);
}

async function runPlanJob(job: PlanJob) {
  job.status = "running";
  touch(job);
  addMessage(job, "Starting plan creation.");

  try {
    const plan = await createPlanFromMarkdown(job.input, {
      onProgress: (message) => addMessage(job, message)
    });
    job.plan = plan;
    job.status = "completed";
    addMessage(job, "Plan creation completed.");
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    addMessage(job, job.error);
  } finally {
    touch(job);
  }
}

function addMessage(job: PlanJob, message: string) {
  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    return;
  }

  job.messages.push({
    timestamp: new Date().toISOString(),
    message: normalizedMessage
  });

  if (job.messages.length > maxMessages) {
    job.messages.splice(0, job.messages.length - maxMessages);
  }

  touch(job);
}

function touch(job: PlanJob) {
  job.updated_at = new Date().toISOString();
}

function snapshotJob(job: PlanJob): PlanJobSnapshot {
  return {
    id: job.id,
    status: job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
    messages: [...job.messages],
    plan: job.plan,
    error: job.error
  };
}
