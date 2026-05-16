import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getPlanDataDir } from "./planStore.js";

export const jobApplicationStatuses = [
  "applied",
  "recruiter_screen",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted"
] as const;

export type JobApplicationStatus = (typeof jobApplicationStatuses)[number];

export interface JobApplicationRecord {
  id: string;
  company: string;
  role: string;
  status: JobApplicationStatus;
  date_applied: string;
  job_url: string;
  location: string;
  next_follow_up_date: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface JobApplicationInput {
  company?: string;
  role?: string;
  status?: string;
  date_applied?: string;
  job_url?: string;
  location?: string;
  next_follow_up_date?: string;
  notes?: string;
}

interface JobApplicationStoreData {
  applications: JobApplicationRecord[];
}

const maxTextBytes = 80_000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const statusSet = new Set<string>(jobApplicationStatuses);

export class JobApplicationStoreError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

export function getJobApplicationsPath() {
  return path.join(getPlanDataDir(), "job-applications.json");
}

export async function listJobApplications() {
  const store = await readStore();
  return store.applications;
}

export async function createJobApplication(input: JobApplicationInput) {
  const store = await readStore();
  const now = new Date().toISOString();
  const application: JobApplicationRecord = {
    id: randomUUID(),
    ...validateAndNormalizeInput(input),
    created_at: now,
    updated_at: now
  };

  store.applications.push(application);
  await writeStore(store);
  return application;
}

export async function updateJobApplication(id: string, input: JobApplicationInput) {
  const store = await readStore();
  const index = findApplicationIndex(store, id);
  const current = store.applications[index];

  const updated: JobApplicationRecord = {
    ...current,
    ...validateAndNormalizeInput({
      ...current,
      ...input
    }),
    updated_at: new Date().toISOString()
  };

  store.applications[index] = updated;
  await writeStore(store);
  return updated;
}

export async function updateJobApplicationStatus(id: string, status: string) {
  const store = await readStore();
  const index = findApplicationIndex(store, id);
  const current = store.applications[index];
  const normalizedStatus = normalizeStatus(status);

  store.applications[index] = {
    ...current,
    status: normalizedStatus,
    updated_at: new Date().toISOString()
  };

  await writeStore(store);
  return store.applications[index];
}

export async function deleteJobApplication(id: string) {
  const store = await readStore();
  const index = findApplicationIndex(store, id);
  const [removed] = store.applications.splice(index, 1);
  await writeStore(store);
  return removed;
}

async function readStore(): Promise<JobApplicationStoreData> {
  try {
    const raw = await fs.readFile(getJobApplicationsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<JobApplicationStoreData>;
    return normalizeStore(parsed);
  } catch (error) {
    if (isFileNotFound(error)) {
      const emptyStore = { applications: [] };
      await writeStore(emptyStore);
      return emptyStore;
    }

    throw new JobApplicationStoreError(`Unable to read job applications: ${getErrorMessage(error)}`, 500);
  }
}

async function writeStore(store: JobApplicationStoreData) {
  const normalizedStore = normalizeStore(store);
  await fs.mkdir(path.dirname(getJobApplicationsPath()), { recursive: true });
  const tempPath = `${getJobApplicationsPath()}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalizedStore, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, getJobApplicationsPath());
}

function normalizeStore(store: Partial<JobApplicationStoreData>) {
  if (!Array.isArray(store.applications)) {
    return { applications: [] };
  }

  return {
    applications: store.applications.map(normalizeStoredApplication)
  };
}

function normalizeStoredApplication(value: Partial<JobApplicationRecord>) {
  const normalized: JobApplicationRecord = {
    id: requireText(String(value.id ?? ""), "id"),
    company: requireText(String(value.company ?? ""), "company"),
    role: requireText(String(value.role ?? ""), "role"),
    status: normalizeStatus(String(value.status ?? "")),
    date_applied: normalizeDate(String(value.date_applied ?? ""), "date_applied", true),
    job_url: normalizeUrl(String(value.job_url ?? "")),
    location: normalizeOptionalText(String(value.location ?? ""), "location"),
    next_follow_up_date: normalizeDate(String(value.next_follow_up_date ?? ""), "next_follow_up_date", false),
    notes: normalizeOptionalText(String(value.notes ?? ""), "notes"),
    created_at: String(value.created_at ?? ""),
    updated_at: String(value.updated_at ?? "")
  };

  return normalized;
}

function validateAndNormalizeInput(input: JobApplicationInput) {
  const company = requireText(String(input.company ?? ""), "company");
  const role = requireText(String(input.role ?? ""), "role");
  const status = normalizeStatus(String(input.status ?? ""));
  const dateApplied = normalizeDate(String(input.date_applied ?? ""), "date_applied", true);
  const jobUrl = normalizeUrl(String(input.job_url ?? ""));
  const location = normalizeOptionalText(String(input.location ?? ""), "location");
  const nextFollowUpDate = normalizeDate(String(input.next_follow_up_date ?? ""), "next_follow_up_date", false);
  const notes = normalizeOptionalText(String(input.notes ?? ""), "notes");

  return {
    company,
    role,
    status,
    date_applied: dateApplied,
    job_url: jobUrl,
    location,
    next_follow_up_date: nextFollowUpDate,
    notes
  };
}

function findApplicationIndex(store: JobApplicationStoreData, id: string) {
  const index = store.applications.findIndex((application) => application.id === id);

  if (index < 0) {
    throw new JobApplicationStoreError(`Job application not found: ${id}`, 404);
  }

  return index;
}

function normalizeStatus(value: string) {
  const normalized = value.trim();

  if (!statusSet.has(normalized)) {
    throw new JobApplicationStoreError(`status has invalid value "${normalized}"`, 400);
  }

  return normalized as JobApplicationStatus;
}

function normalizeDate(value: string, field: string, required: boolean) {
  const normalized = value.trim();

  if (!normalized) {
    if (required) {
      throw new JobApplicationStoreError(`${field} is required`, 400);
    }

    return "";
  }

  if (!datePattern.test(normalized)) {
    throw new JobApplicationStoreError(`${field} must use YYYY-MM-DD`, 400);
  }

  return normalized;
}

function normalizeUrl(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new JobApplicationStoreError("job_url must be a valid URL", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new JobApplicationStoreError("job_url must use http or https", 400);
  }

  return parsed.toString();
}

function normalizeOptionalText(value: string, field: string) {
  const normalized = value.trim();

  if (Buffer.byteLength(normalized, "utf8") > maxTextBytes) {
    throw new JobApplicationStoreError(`${field} is too large`, 400);
  }

  return normalized;
}

function requireText(value: string, field: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new JobApplicationStoreError(`${field} is required`, 400);
  }

  if (Buffer.byteLength(normalized, "utf8") > maxTextBytes) {
    throw new JobApplicationStoreError(`${field} is too large`, 400);
  }

  return normalized;
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
