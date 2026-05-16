import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  type ActivityInput,
  type ActivityRowWithIndex,
  appendActivityRow,
  loadActivityRows,
  updateActivityRow as updateLegacyActivityRow
} from "./csvStore.js";
import {
  deleteJobApplication,
  type JobApplicationInput,
  type JobApplicationRecord,
  jobApplicationStatuses,
  listJobApplications,
  updateJobApplication,
  updateJobApplicationStatus
} from "./jobApplicationStore.js";
import { getPlanDataDir, getPlanById, listPlans } from "./planStore.js";

export const learningWorkspaceStatuses = ["not_started", "in_progress", "review_again", "done", "skipped"] as const;
export type LearningWorkspaceStatus = (typeof learningWorkspaceStatuses)[number];
export type WorkspaceKind = "learning" | "job_search";
export type WorkspaceSourceType = "legacy_plan" | "generic_learning" | "generic_job_search" | "job_applications";

export interface WorkspaceSummary {
  id: string;
  name: string;
  kind: WorkspaceKind;
  source_type: WorkspaceSourceType;
  source_ref: string;
  description: string;
  subject_ids: string[];
  board_config: {
    lane_type: "status";
    lanes: Array<{ id: string; label: string }>;
  };
}

export interface SubjectSummary {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  notes_path: string;
  sort_order: number;
}

export interface WorkspaceCard {
  id: string;
  workspace_id: string;
  subject_id: string;
  title: string;
  status: string;
  notes: string;
  tags: string[];
  source: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, string>;
}

export interface LegacyPlanWorkspaceMigrationResult {
  workspace: WorkspaceSummary;
  migrated_card_count: number;
  old_workspace_id: string;
}

export interface GenericTaskRecord extends Omit<WorkspaceCard, "status"> {
  status: string;
}

interface GenericWorkspaceRecord {
  id: string;
  name: string;
  kind: WorkspaceKind;
  source_type: "generic_learning" | "generic_job_search";
  source_ref: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceRegistry {
  workspaces: GenericWorkspaceRecord[];
}

const genericSubjectFileName = "subjects.json";
const genericTaskFileName = "tasks.json";
const workspaceRegistryFileName = "workspaces.json";
const maxTextBytes = 80_000;
const maxTagCount = 12;
const maxCardsPerWorkspace = 2_000;
const learningStatusSet = new Set<string>(learningWorkspaceStatuses);
const jobStatusSet = new Set<string>(jobApplicationStatuses);
const defaultGenericSubjects = [
  { id: "general", name: "General" },
  { id: "leetcode", name: "LeetCode" },
  { id: "system-design", name: "System Design" },
  { id: "behavioral", name: "Behavioral" },
  { id: "review", name: "Review" }
] as const;
const defaultGenericJobSearchSubjects = [{ id: "applications", name: "Applications" }] as const;
const legacyCombinedLeetCodeSubjectIds = new Set(["algorithms", "data-structures"]);
const legacyDefaultGenericSubjectIds = ["general", "algorithms", "data-structures", "system-design", "behavioral", "review"] as const;

export class WorkspaceStoreError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

export function getWorkspaceRegistryPath() {
  return path.join(getPlanDataDir(), workspaceRegistryFileName);
}

export function getWorkspacesRootDir() {
  return path.join(getPlanDataDir(), "workspaces");
}

async function readWorkspaceRecord(workspaceId: string) {
  const registry = await readRegistry();
  const record = registry.workspaces.find((workspace) => workspace.id === workspaceId);

  if (!record) {
    throw new WorkspaceStoreError(`Workspace not found: ${workspaceId}`, 404);
  }

  return record;
}

export async function ensureWorkspaceRegistry() {
  const registry = await readRegistry();
  await Promise.all(
    registry.workspaces.map(async (workspace) => {
      await fs.mkdir(workspaceDir(workspace.id), { recursive: true });
      await ensureGenericWorkspaceFiles(workspace.id);
    })
  );
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const registry = await readRegistry();
  const genericWorkspaces = await Promise.all(registry.workspaces.map(toGenericWorkspaceSummary));
  const importedPlanWorkspaces = (await listPlans()).map((plan) => toLegacyPlanWorkspace(plan.id, plan.name));
  const jobWorkspace = await shouldExposeJobWorkspace();
  const combined = [...genericWorkspaces, ...importedPlanWorkspaces, ...(jobWorkspace ? [toJobApplicationsWorkspace()] : [])];
  return combined.sort(compareWorkspaces);
}

export async function getWorkspace(workspaceId: string) {
  const workspace = (await listWorkspaces()).find((candidate) => candidate.id === workspaceId);

  if (!workspace) {
    throw new WorkspaceStoreError(`Workspace not found: ${workspaceId}`, 404);
  }

  return workspace;
}

export async function createWorkspace(input: { name: string; description?: string; kind?: string }) {
  const registry = await readRegistry();
  const name = requireText(String(input.name ?? ""), "name");
  const description = normalizeOptionalText(String(input.description ?? ""), "description");
  const kind = normalizeWorkspaceKind(String(input.kind ?? "learning"));
  const now = new Date().toISOString();
  const id = uniqueWorkspaceId(name, registry.workspaces);
  const record: GenericWorkspaceRecord = {
    id,
    name,
    kind,
    source_type: kind === "job_search" ? "generic_job_search" : "generic_learning",
    source_ref: id,
    description,
    created_at: now,
    updated_at: now
  };

  registry.workspaces.push(record);
  await writeRegistry(registry);
  await fs.mkdir(workspaceDir(id), { recursive: true });
  await writeSubjects(id, buildDefaultSubjectsForWorkspace(record));
  await writeTasks(record, []);
  await writeWorkspaceNotes(id, "");
  return toGenericWorkspaceSummary(record);
}

export async function migrateLegacyPlanToWorkspace(plan: { id: string; name: string; csv_path: string }) {
  const rows = await loadActivityRows(plan.csv_path);
  const registry = await readRegistry();
  const now = new Date().toISOString();
  const workspaceId = uniqueWorkspaceId(plan.name, registry.workspaces);
  const record: GenericWorkspaceRecord = {
    id: workspaceId,
    name: plan.name,
    kind: "learning",
    source_type: "generic_learning",
    source_ref: workspaceId,
    description: "Migrated from a legacy plan workspace.",
    created_at: now,
    updated_at: now
  };

  registry.workspaces.push(record);
  await writeRegistry(registry);
  await fs.mkdir(workspaceDir(workspaceId), { recursive: true });
  await writeSubjects(workspaceId, buildDefaultSubjectsForWorkspace(record));
  await writeTasks(
    record,
    rows.map((row) => {
      const legacyCard = mapLegacyRowToCard(workspaceId, row);
      return {
        ...legacyCard,
        id: row.row_id || legacyCard.id,
        workspace_id: workspaceId,
        updated_at: legacyCard.updated_at || legacyCard.created_at
      };
    })
  );
  await writeWorkspaceNotes(workspaceId, "");
  await copyLegacyPlanWorkspaceArtifacts(plan.id, workspaceId);

  return {
    workspace: await toGenericWorkspaceSummary(record),
    migrated_card_count: rows.length,
    old_workspace_id: legacyPlanWorkspaceId(plan.id)
  } satisfies LegacyPlanWorkspaceMigrationResult;
}

export async function deleteWorkspace(workspaceId: string) {
  const registry = await readRegistry();
  const index = registry.workspaces.findIndex((workspace) => workspace.id === workspaceId);

  if (index < 0) {
    throw new WorkspaceStoreError(`Managed workspace not found or cannot be deleted: ${workspaceId}`, 404);
  }

  const [removed] = registry.workspaces.splice(index, 1);
  await writeRegistry(registry);
  await deleteWorkspaceFiles(workspaceId);
  return toGenericWorkspaceSummary(removed);
}

export async function deleteLegacyPlanWorkspaceStorage(planId: string) {
  await deleteWorkspaceFiles(legacyPlanWorkspaceId(planId));
}

export async function listWorkspaceSubjects(workspaceId: string) {
  const workspace = await getWorkspace(workspaceId);

  if (workspace.source_type === "generic_learning" || workspace.source_type === "generic_job_search") {
    return readSubjects(workspace.id);
  }

  if (workspace.source_type === "job_applications") {
    return [
      {
        id: "applications",
        workspace_id: workspace.id,
        name: "Applications",
        slug: "applications",
        notes_path: subjectNotesPath(workspace.id, "applications"),
        sort_order: 0
      }
    ];
  }

  const rows = await loadRowsForLegacyWorkspace(workspace);
  const subjectMap = new Map<string, SubjectSummary>();

  for (const row of rows) {
    const subject = inferLegacySubject(row);
    if (!subjectMap.has(subject.id)) {
      subjectMap.set(subject.id, {
        ...subject,
        workspace_id: workspace.id,
        notes_path: subjectNotesPath(workspace.id, subject.id)
      });
    }
  }

  return Array.from(subjectMap.values()).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export async function createWorkspaceSubject(workspaceId: string, input: { name: string }) {
  const workspace = await getWorkspace(workspaceId);

  if (workspace.source_type !== "generic_learning") {
    throw new WorkspaceStoreError("Subjects can only be created for generic learning workspaces", 400);
  }

  const subjects = await readSubjects(workspace.id);
  const name = requireText(String(input.name ?? ""), "name");
  const slug = uniqueSubjectSlug(name, subjects);
  const subject: SubjectSummary = {
    id: slug,
    workspace_id: workspace.id,
    name,
    slug,
    notes_path: subjectNotesPath(workspace.id, slug),
    sort_order: subjects.length
  };

  subjects.push(subject);
  await writeSubjects(workspace.id, subjects);
  return subject;
}

export async function listWorkspaceCards(workspaceId: string) {
  const workspace = await getWorkspace(workspaceId);

  if (workspace.source_type === "generic_learning" || workspace.source_type === "generic_job_search") {
    return readTasks(workspace);
  }

  if (workspace.source_type === "job_applications") {
    return (await listJobApplications()).map(mapJobApplicationToCard);
  }

  const rows = await loadRowsForLegacyWorkspace(workspace);
  return rows.map((row) => mapLegacyRowToCard(workspace.id, row));
}

export async function createWorkspaceCard(
  workspaceId: string,
  input: {
    subject_id?: string;
    title?: string;
    status?: string;
    notes?: string;
    tags?: string[];
    metadata?: Record<string, string>;
  }
) {
  const workspace = await getWorkspace(workspaceId);

  if (workspace.source_type === "legacy_plan") {
    const plan = await getPlanById(workspace.source_ref);
    const subjectId = String(input.subject_id ?? "leetcode").trim() || "leetcode";
    const mapped = mapSubjectIdToLegacyFields(subjectId);
    const today = getLocalDate();
    const row = await appendActivityRow(
      {
        date: today,
        scheduled_date: today,
        category: mapped.category,
        item_type: mapped.item_type,
        item_name: requireText(String(input.title ?? ""), "title"),
        difficulty: "",
        status: normalizeLearningStatus(String(input.status ?? "not_started")),
        time_spent_min: "",
        confidence: "",
        attempt_type: "",
        result: "",
        pattern: "",
        interview_relevance: "medium",
        completed_at: "",
        source: "custom",
        notes: normalizeOptionalText(String(input.notes ?? ""), "notes")
      },
      plan.csv_path
    );
    return mapLegacyRowToCard(workspace.id, row);
  }

  if (workspace.source_type !== "generic_learning") {
    if (workspace.source_type !== "generic_job_search") {
      throw new WorkspaceStoreError("Cards can only be created for managed workspaces", 400);
    }
  }

  const subjects = await readSubjects(workspace.id);
  const tasks = await readTasks(workspace);

  if (tasks.length >= maxCardsPerWorkspace) {
    throw new WorkspaceStoreError(`Workspace already has ${maxCardsPerWorkspace.toLocaleString()} cards`, 400);
  }

  const subjectId = normalizeGenericSubjectId(input.subject_id, subjects);
  const now = new Date().toISOString();
  const card: GenericTaskRecord = {
    id: randomUUID(),
    workspace_id: workspace.id,
    subject_id: workspace.source_type === "generic_job_search" ? "applications" : subjectId,
    title: requireText(String(input.title ?? ""), "title"),
    status: normalizeWorkspaceStatus(workspace, String(input.status ?? defaultStatusForWorkspace(workspace))),
    notes: normalizeOptionalText(String(input.notes ?? ""), "notes"),
    tags: normalizeTags(input.tags),
    source: "custom",
    created_at: now,
    updated_at: now,
    metadata: normalizeCardMetadata(workspace, input.metadata)
  };

  tasks.unshift(card);
  await writeTasks(workspace, tasks);
  return card;
}

export async function updateWorkspaceCard(
  workspaceId: string,
  cardId: string,
  input: {
    subject_id?: string;
    title?: string;
    status?: string;
    notes?: string;
    tags?: string[];
    metadata?: Record<string, string>;
  }
) {
  const workspace = await getWorkspace(workspaceId);

  if (workspace.source_type === "generic_learning" || workspace.source_type === "generic_job_search") {
    const subjects = await readSubjects(workspace.id);
    const tasks = await readTasks(workspace);
    const index = tasks.findIndex((task) => task.id === cardId);

    if (index < 0) {
      throw new WorkspaceStoreError(`Card not found: ${cardId}`, 404);
    }

    const current = tasks[index];
    const updated: GenericTaskRecord = {
      ...current,
      subject_id:
        workspace.source_type === "generic_job_search"
          ? "applications"
          : input.subject_id
            ? normalizeGenericSubjectId(input.subject_id, subjects)
            : current.subject_id,
      title: input.title === undefined ? current.title : requireText(String(input.title), "title"),
      status: input.status === undefined ? current.status : normalizeWorkspaceStatus(workspace, String(input.status)),
      notes: input.notes === undefined ? current.notes : normalizeOptionalText(String(input.notes), "notes"),
      tags: input.tags === undefined ? current.tags : normalizeTags(input.tags),
      metadata: input.metadata === undefined ? current.metadata : normalizeCardMetadata(workspace, input.metadata),
      updated_at: new Date().toISOString()
    };

    tasks[index] = updated;
    await writeTasks(workspace, tasks);
    return updated;
  }

  if (workspace.source_type === "job_applications") {
    const applications = await listJobApplications();
    const application = applications.find((candidate) => candidate.id === cardId);

    if (!application) {
      throw new WorkspaceStoreError(`Job application not found: ${cardId}`, 404);
    }

    if (input.status !== undefined && input.status !== application.status) {
      await updateJobApplicationStatus(application.id, String(input.status));
    }

    if (input.notes !== undefined || input.title !== undefined) {
      const [company, ...roleParts] = String(input.title ?? `${application.company} - ${application.role}`).split(" - ");
      await updateJobApplication(application.id, {
        ...application,
        company: requireText(company, "company"),
        role: requireText(roleParts.join(" - ") || application.role, "role"),
        notes: input.notes === undefined ? application.notes : String(input.notes)
      });
    }

    const updatedApplications = await listJobApplications();
    const updated = updatedApplications.find((candidate) => candidate.id === cardId);

    if (!updated) {
      throw new WorkspaceStoreError(`Job application not found after update: ${cardId}`, 404);
    }

    return mapJobApplicationToCard(updated);
  }

  const legacyResult = await updateLegacyWorkspaceCard(workspace, cardId, input);
  return legacyResult.card;
}

export async function deleteWorkspaceCard(workspaceId: string, cardId: string) {
  const workspace = await getWorkspace(workspaceId);

  if (workspace.source_type === "generic_learning" || workspace.source_type === "generic_job_search") {
    const tasks = await readTasks(workspace);
    const index = tasks.findIndex((task) => task.id === cardId);

    if (index < 0) {
      throw new WorkspaceStoreError(`Card not found: ${cardId}`, 404);
    }

    const [removed] = tasks.splice(index, 1);
    await writeTasks(workspace, tasks);
    return removed;
  }

  if (workspace.source_type === "job_applications") {
    const applications = await listJobApplications();
    const application = applications.find((candidate) => candidate.id === cardId);

    if (!application) {
      throw new WorkspaceStoreError(`Job application not found: ${cardId}`, 404);
    }

    return mapJobApplicationToCard(await deleteJobApplication(application.id));
  }

  throw new WorkspaceStoreError("Cards can only be deleted from managed workspaces", 400);
}

export async function getWorkspaceNotes(workspaceId: string) {
  const workspace = await getWorkspace(workspaceId);
  const notesPath = workspaceNotesPath(workspace.id);
  const content = await readOptionalFile(notesPath);
  return {
    path: notesPath,
    content,
    updated_at: await getUpdatedAt(notesPath)
  };
}

export async function updateWorkspaceNotesContent(workspaceId: string, content: string) {
  await getWorkspace(workspaceId);
  await writeWorkspaceNotes(workspaceId, String(content ?? ""));
  return getWorkspaceNotes(workspaceId);
}

export async function buildWorkspaceChatContext(workspaceId: string) {
  const workspace = await getWorkspace(workspaceId);
  const [subjects, cards, notes] = await Promise.all([
    listWorkspaceSubjects(workspace.id),
    listWorkspaceCards(workspace.id),
    getWorkspaceNotes(workspace.id)
  ]);

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      kind: workspace.kind,
      source_type: workspace.source_type,
      description: workspace.description
    },
    notes: notes.content || "No workspace notes yet.",
    subjects,
    cards: cards.slice(0, 200)
  };
}

async function updateLegacyWorkspaceCard(
  workspace: WorkspaceSummary,
  cardId: string,
  input: { title?: string; status?: string; notes?: string }
) {
  const plan = await getPlanById(workspace.source_ref);
  const rows = await loadActivityRows(plan.csv_path);
  const row = rows.find((candidate) => candidate.row_id === cardId) ?? rows.find((candidate) => legacyFallbackCardId(candidate) === cardId);

  if (!row) {
    throw new WorkspaceStoreError(`Legacy tracker row not found: ${cardId}`, 404);
  }

  const update: ActivityInput = {};

  if (input.title !== undefined) {
    update.item_name = requireText(String(input.title), "title");
  }

  if (input.status !== undefined) {
    update.status = normalizeLearningStatus(String(input.status));
  }

  if (input.notes !== undefined) {
    update.notes = normalizeOptionalText(String(input.notes), "notes");
  }

  const updatedRow = await updateLegacyActivityRow(row.row_index, update, plan.csv_path);
  return {
    row: updatedRow,
    card: mapLegacyRowToCard(workspace.id, updatedRow)
  };
}

async function toGenericWorkspaceSummary(workspace: GenericWorkspaceRecord): Promise<WorkspaceSummary> {
  const subjects = await readSubjects(workspace.id);
  return {
    id: workspace.id,
    name: workspace.name,
    kind: workspace.kind,
    source_type: workspace.source_type,
    source_ref: workspace.source_ref,
    description: workspace.description,
    subject_ids: subjects.map((subject) => subject.id),
    board_config: buildBoardConfig(workspace.kind)
  };
}

function toLegacyPlanWorkspace(planId: string, planName: string): WorkspaceSummary {
  return {
    id: `plan-${planId}`,
    name: planName,
    kind: "learning",
    source_type: "legacy_plan",
    source_ref: planId,
    description: "Imported from an existing interview-prep plan.",
    subject_ids: [],
    board_config: {
      lane_type: "status",
      lanes: learningWorkspaceStatuses.map((status) => ({
        id: status,
        label: labelForLearningStatus(status)
      }))
    }
  };
}

function toJobApplicationsWorkspace(): WorkspaceSummary {
  return {
    id: "job-search",
    name: "Job Search",
    kind: "job_search",
    source_type: "job_applications",
    source_ref: "job-applications",
    description: "Track applications as a workspace board.",
    subject_ids: ["applications"],
    board_config: {
      lane_type: "status",
      lanes: jobApplicationStatuses.map((status) => ({
        id: status,
        label: labelForValue(status)
      }))
    }
  };
}

async function loadRowsForLegacyWorkspace(workspace: WorkspaceSummary) {
  const plan = await getPlanById(workspace.source_ref);
  return loadActivityRows(plan.csv_path);
}

function mapLegacyRowToCard(workspaceId: string, row: ActivityRowWithIndex): WorkspaceCard {
  const subject = inferLegacySubject(row);
  return {
    id: row.row_id || legacyFallbackCardId(row),
    workspace_id: workspaceId,
    subject_id: subject.id,
    title: row.item_name,
    status: row.status,
    notes: row.notes,
    tags: [row.category, row.item_type].filter(Boolean),
    source: row.source,
    created_at: row.date,
    updated_at: row.completed_at || row.scheduled_date || row.date,
    metadata: {
      category: row.category,
      item_type: row.item_type,
      difficulty: row.difficulty,
      scheduled_date: row.scheduled_date,
      completed_at: row.completed_at,
      confidence: row.confidence,
      result: row.result
    }
  };
}

function mapJobApplicationToCard(application: JobApplicationRecord): WorkspaceCard {
  return {
    id: application.id,
    workspace_id: "job-search",
    subject_id: "applications",
    title: `${application.company} - ${application.role}`,
    status: application.status,
    notes: application.notes,
    tags: [application.location].filter(Boolean),
    source: "job_applications",
    created_at: application.created_at,
    updated_at: application.updated_at,
    metadata: {
      company: application.company,
      role: application.role,
      date_applied: application.date_applied,
      next_follow_up_date: application.next_follow_up_date,
      job_url: application.job_url,
      location: application.location
    }
  };
}

function inferLegacySubject(row: ActivityRowWithIndex) {
  if (row.item_type === "system_design" || row.category === "system_design") {
    return { id: "system-design", name: "System Design", slug: "system-design", sort_order: 1 };
  }

  if (row.item_type === "behavioral" || row.category === "behavioral") {
    return { id: "behavioral", name: "Behavioral", slug: "behavioral", sort_order: 2 };
  }

  if (row.category === "review" || row.item_type === "notes_review") {
    return { id: "review", name: "Review", slug: "review", sort_order: 3 };
  }

  return { id: "leetcode", name: "LeetCode", slug: "leetcode", sort_order: 0 };
}

function mapSubjectIdToLegacyFields(subjectId: string) {
  if (subjectId === "system-design") {
    return { category: "system_design", item_type: "system_design" } as const;
  }

  if (subjectId === "behavioral") {
    return { category: "behavioral", item_type: "behavioral" } as const;
  }

  if (subjectId === "review") {
    return { category: "review", item_type: "notes_review" } as const;
  }

  return { category: "arrays_hashing", item_type: "leetcode_new" } as const;
}

async function readRegistry(): Promise<WorkspaceRegistry> {
  try {
    const raw = await fs.readFile(getWorkspaceRegistryPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkspaceRegistry>;
    return normalizeRegistry(parsed);
  } catch (error) {
    if (isFileNotFound(error)) {
      const emptyRegistry = { workspaces: [] };
      await writeRegistry(emptyRegistry);
      return emptyRegistry;
    }

    throw new WorkspaceStoreError(`Unable to read workspaces: ${getErrorMessage(error)}`, 500);
  }
}

async function writeRegistry(registry: WorkspaceRegistry) {
  const normalized = normalizeRegistry(registry);
  await fs.mkdir(path.dirname(getWorkspaceRegistryPath()), { recursive: true });
  const tempPath = `${getWorkspaceRegistryPath()}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, getWorkspaceRegistryPath());
}

async function deleteWorkspaceFiles(workspaceId: string) {
  const rootDir = path.resolve(getWorkspacesRootDir());
  const targetDir = path.resolve(workspaceDir(workspaceId));

  if (targetDir !== rootDir && !isPathInside(targetDir, rootDir)) {
    throw new WorkspaceStoreError(`Refusing to delete workspace outside root: ${targetDir}`, 500);
  }

  await fs.rm(targetDir, { recursive: true, force: true });
}

async function copyLegacyPlanWorkspaceArtifacts(planId: string, nextWorkspaceId: string) {
  const sourceDir = workspaceDir(legacyPlanWorkspaceId(planId));
  const targetDir = workspaceDir(nextWorkspaceId);

  if (!(await pathExists(sourceDir))) {
    return;
  }

  const sourceNotes = workspaceNotesPath(legacyPlanWorkspaceId(planId));
  if (await pathExists(sourceNotes)) {
    await fs.copyFile(sourceNotes, workspaceNotesPath(nextWorkspaceId));
  }

  const sourceLegacyNotebook = path.join(sourceDir, "notebook.json");
  if (await pathExists(sourceLegacyNotebook)) {
    await fs.copyFile(sourceLegacyNotebook, path.join(targetDir, "notebook.json"));
  }

  const sourceNotebookDir = path.join(sourceDir, "notebooks");
  const targetNotebookDir = path.join(targetDir, "notebooks");
  if (await pathExists(sourceNotebookDir)) {
    await fs.rm(targetNotebookDir, { recursive: true, force: true });
    await fs.cp(sourceNotebookDir, targetNotebookDir, { recursive: true });
  }
}

function normalizeRegistry(registry: Partial<WorkspaceRegistry>): WorkspaceRegistry {
  return {
    workspaces: Array.isArray(registry.workspaces)
      ? registry.workspaces.map((workspace) => ({
          id: requireText(String(workspace.id ?? ""), "id"),
          name: requireText(String(workspace.name ?? ""), "name"),
          kind: normalizeWorkspaceKind(String(workspace.kind ?? "learning")),
          source_type: normalizeGenericWorkspaceSourceType(String(workspace.source_type ?? "generic_learning"), workspace.kind),
          source_ref: requireText(String(workspace.source_ref ?? workspace.id ?? ""), "source_ref"),
          description: normalizeOptionalText(String(workspace.description ?? ""), "description"),
          created_at: String(workspace.created_at ?? new Date().toISOString()),
          updated_at: String(workspace.updated_at ?? new Date().toISOString())
        }))
      : []
  };
}

async function ensureGenericWorkspaceFiles(workspaceId: string) {
  const record = await readWorkspaceRecord(workspaceId);
  const directory = workspaceDir(workspaceId);
  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.access(subjectsPath(workspaceId));
  } catch {
    await writeSubjects(workspaceId, buildDefaultSubjectsForWorkspace(record));
  }

  if (record.source_type === "generic_learning") {
    await upgradeLegacyDefaultSubjects(workspaceId);
    await upgradeLegacyLeetCodeSubjects(workspaceId);
  }

  try {
    await fs.access(tasksPath(workspaceId));
  } catch {
    await writeTasks(record, []);
  }

  try {
    await fs.access(workspaceNotesPath(workspaceId));
  } catch {
    await writeWorkspaceNotes(workspaceId, "");
  }
}

async function readSubjects(workspaceId: string) {
  await ensureGenericWorkspaceFiles(workspaceId);
  try {
    const raw = await fs.readFile(subjectsPath(workspaceId), "utf8");
    const parsed = JSON.parse(raw) as SubjectSummary[];
    return normalizeSubjects(workspaceId, parsed);
  } catch (error) {
    throw new WorkspaceStoreError(`Unable to read workspace subjects: ${getErrorMessage(error)}`, 500);
  }
}

async function writeSubjects(workspaceId: string, subjects: SubjectSummary[]) {
  await fs.mkdir(workspaceDir(workspaceId), { recursive: true });
  const normalized = normalizeSubjects(workspaceId, subjects);
  const targetPath = subjectsPath(workspaceId);
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, targetPath);
}

function normalizeSubjects(workspaceId: string, subjects: SubjectSummary[]) {
  return (Array.isArray(subjects) ? subjects : []).map((subject, index) => {
    const name = requireText(String(subject.name ?? ""), "subject.name");
    const slug = String(subject.slug ?? subject.id ?? slugify(name)).trim() || slugify(name) || `subject-${index + 1}`;
    return {
      id: slug,
      workspace_id: workspaceId,
      name,
      slug,
      notes_path: subjectNotesPath(workspaceId, slug),
      sort_order: Number.isInteger(subject.sort_order) ? Number(subject.sort_order) : index
    };
  });
}

function buildDefaultGenericSubjects(workspaceId: string) {
  return defaultGenericSubjects.map((subject, index) => {
    const slug = subject.id;
    return {
      id: slug,
      workspace_id: workspaceId,
      name: subject.name,
      slug,
      notes_path: subjectNotesPath(workspaceId, slug),
      sort_order: index
    };
  });
}

function buildDefaultJobSearchSubjects(workspaceId: string) {
  return defaultGenericJobSearchSubjects.map((subject, index) => ({
    id: subject.id,
    workspace_id: workspaceId,
    name: subject.name,
    slug: subject.id,
    notes_path: subjectNotesPath(workspaceId, subject.id),
    sort_order: index
  }));
}

function buildDefaultSubjectsForWorkspace(workspace: Pick<GenericWorkspaceRecord, "id" | "source_type">) {
  return workspace.source_type === "generic_job_search" ? buildDefaultJobSearchSubjects(workspace.id) : buildDefaultGenericSubjects(workspace.id);
}

async function upgradeLegacyDefaultSubjects(workspaceId: string) {
  try {
    const raw = await fs.readFile(subjectsPath(workspaceId), "utf8");
    const parsed = JSON.parse(raw) as SubjectSummary[];
    const normalized = normalizeSubjects(workspaceId, parsed);

    if (!shouldUpgradeLegacyDefaultSubjects(normalized)) {
      return;
    }

    await writeSubjects(workspaceId, buildDefaultGenericSubjects(workspaceId));
  } catch (error) {
    throw new WorkspaceStoreError(`Unable to upgrade workspace subjects: ${getErrorMessage(error)}`, 500);
  }
}

async function upgradeLegacyLeetCodeSubjects(workspaceId: string) {
  try {
    const raw = await fs.readFile(subjectsPath(workspaceId), "utf8");
    const parsed = JSON.parse(raw) as SubjectSummary[];
    const normalized = normalizeSubjects(workspaceId, parsed);

    if (!shouldUpgradeLegacyLeetCodeSubjects(normalized)) {
      return;
    }

    await writeSubjects(workspaceId, buildDefaultGenericSubjects(workspaceId));
    await rewriteLegacyLeetCodeTaskSubjects(workspaceId);
  } catch (error) {
    throw new WorkspaceStoreError(`Unable to upgrade LeetCode workspace subjects: ${getErrorMessage(error)}`, 500);
  }
}

function shouldUpgradeLegacyDefaultSubjects(subjects: SubjectSummary[]) {
  if (subjects.length === 0) {
    return true;
  }

  if (subjects.length !== 1) {
    return false;
  }

  const [subject] = subjects;
  return subject.id === "general" || subject.slug === "general" || subject.name.trim().toLowerCase() === "general";
}

function shouldUpgradeLegacyLeetCodeSubjects(subjects: SubjectSummary[]) {
  if (subjects.length !== legacyDefaultGenericSubjectIds.length) {
    return false;
  }

  return subjects.every((subject, index) => subject.id === legacyDefaultGenericSubjectIds[index]);
}

async function readTasks(workspace: Pick<WorkspaceSummary, "id" | "kind" | "source_type">) {
  await ensureGenericWorkspaceFiles(workspace.id);
  try {
    const raw = await fs.readFile(tasksPath(workspace.id), "utf8");
    const parsed = JSON.parse(raw) as GenericTaskRecord[];
    return normalizeTasks(workspace, parsed);
  } catch (error) {
    throw new WorkspaceStoreError(`Unable to read workspace tasks: ${getErrorMessage(error)}`, 500);
  }
}

async function rewriteLegacyLeetCodeTaskSubjects(workspaceId: string) {
  try {
    const raw = await fs.readFile(tasksPath(workspaceId), "utf8");
    const parsed = JSON.parse(raw) as GenericTaskRecord[];
    const normalized = normalizeTasks({ id: workspaceId, kind: "learning", source_type: "generic_learning" }, parsed);
    let changed = false;
    const rewritten = normalized.map((task) => {
      if (!legacyCombinedLeetCodeSubjectIds.has(task.subject_id)) {
        return task;
      }

      changed = true;
      return {
        ...task,
        subject_id: "leetcode",
        updated_at: new Date().toISOString()
      };
    });

    if (changed) {
      await writeTasks({ id: workspaceId, kind: "learning", source_type: "generic_learning" }, rewritten);
    }
  } catch (error) {
    if (isFileNotFound(error)) {
      return;
    }

    throw error;
  }
}

async function writeTasks(workspace: Pick<WorkspaceSummary, "id" | "kind" | "source_type">, tasks: GenericTaskRecord[]) {
  await fs.mkdir(workspaceDir(workspace.id), { recursive: true });
  const normalized = normalizeTasks(workspace, tasks);
  const targetPath = tasksPath(workspace.id);
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, targetPath);
}

function normalizeTasks(workspace: Pick<WorkspaceSummary, "id" | "kind" | "source_type">, tasks: GenericTaskRecord[]) {
  return (Array.isArray(tasks) ? tasks : []).map((task) => ({
    id: requireText(String(task.id ?? randomUUID()), "task.id"),
    workspace_id: workspace.id,
    subject_id: requireText(String(task.subject_id ?? defaultSubjectIdForWorkspace(workspace)), "subject_id"),
    title: requireText(String(task.title ?? ""), "title"),
    status: normalizeWorkspaceStatus(workspace, String(task.status ?? defaultStatusForWorkspace(workspace))),
    notes: normalizeOptionalText(String(task.notes ?? ""), "notes"),
    tags: normalizeTags(task.tags),
    source: normalizeOptionalText(String(task.source ?? "custom"), "source"),
    created_at: String(task.created_at ?? new Date().toISOString()),
    updated_at: String(task.updated_at ?? new Date().toISOString()),
    metadata: normalizeCardMetadata(workspace, task.metadata)
  }));
}

async function writeWorkspaceNotes(workspaceId: string, content: string) {
  await fs.mkdir(workspaceDir(workspaceId), { recursive: true });
  await fs.writeFile(workspaceNotesPath(workspaceId), `${String(content ?? "").trim()}\n`, "utf8");
}

async function shouldExposeJobWorkspace() {
  try {
    await fs.access(path.join(getPlanDataDir(), "job-applications.json"));
    return true;
  } catch {
    return false;
  }
}

function normalizeGenericSubjectId(subjectId: string | undefined, subjects: SubjectSummary[]) {
  const requested = String(subjectId ?? "").trim() || subjects[0]?.id || "general";
  const normalized =
    requested !== "leetcode" && legacyCombinedLeetCodeSubjectIds.has(requested) && subjects.some((subject) => subject.id === "leetcode")
      ? "leetcode"
      : requested;

  if (!subjects.some((subject) => subject.id === normalized)) {
    throw new WorkspaceStoreError(`Unknown subject: ${normalized}`, 400);
  }

  return normalized;
}

function normalizeLearningStatus(value: string) {
  const normalized = value.trim();

  if (!learningStatusSet.has(normalized)) {
    throw new WorkspaceStoreError(`status has invalid value "${normalized}"`, 400);
  }

  return normalized as LearningWorkspaceStatus;
}

function normalizeWorkspaceKind(value: string) {
  const normalized = value.trim();

  if (normalized !== "learning" && normalized !== "job_search") {
    throw new WorkspaceStoreError(`kind has invalid value "${normalized}"`, 400);
  }

  return normalized as WorkspaceKind;
}

function normalizeGenericWorkspaceSourceType(value: string, kind: unknown) {
  const normalizedKind = normalizeWorkspaceKind(String(kind ?? "learning"));
  const normalized = value.trim();

  if (normalized === "generic_learning" || normalized === "generic_job_search") {
    return normalized;
  }

  return normalizedKind === "job_search" ? "generic_job_search" : "generic_learning";
}

function buildBoardConfig(kind: WorkspaceKind) {
  return {
    lane_type: "status" as const,
    lanes:
      kind === "job_search"
        ? jobApplicationStatuses.map((status) => ({
            id: status,
            label: labelForValue(status)
          }))
        : learningWorkspaceStatuses.map((status) => ({
            id: status,
            label: labelForLearningStatus(status)
          }))
  };
}

function defaultSubjectIdForWorkspace(workspace: Pick<WorkspaceSummary, "source_type">) {
  return workspace.source_type === "generic_job_search" ? "applications" : "general";
}

function defaultStatusForWorkspace(workspace: Pick<WorkspaceSummary, "kind">) {
  return workspace.kind === "job_search" ? "applied" : "not_started";
}

function normalizeWorkspaceStatus(workspace: Pick<WorkspaceSummary, "kind">, value: string) {
  return workspace.kind === "job_search" ? normalizeJobStatus(value) : normalizeLearningStatus(value);
}

function normalizeJobStatus(value: string) {
  const normalized = value.trim();

  if (!jobStatusSet.has(normalized)) {
    throw new WorkspaceStoreError(`status has invalid value "${normalized}"`, 400);
  }

  return normalized;
}

function normalizeOptionalDate(value: string, field: string) {
  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new WorkspaceStoreError(`${field} must use YYYY-MM-DD`, 400);
  }

  return normalized;
}

function normalizeOptionalJobUrl(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new WorkspaceStoreError("metadata.job_url must be a valid URL", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WorkspaceStoreError("metadata.job_url must use http or https", 400);
  }

  return parsed.toString();
}

function normalizeTags(tags: unknown) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => normalizeOptionalText(String(tag ?? ""), "tag"))
    .filter(Boolean)
    .slice(0, maxTagCount);
}

function normalizeCardMetadata(workspace: Pick<WorkspaceSummary, "source_type">, metadata: unknown): Record<string, string> {
  if (!isRecord(metadata)) {
    return {};
  }

  const normalized = stringifyRecord(metadata);

  if (workspace.source_type === "generic_job_search" || workspace.source_type === "job_applications") {
    return {
      company: requireText(String(normalized.company ?? ""), "metadata.company"),
      role: requireText(String(normalized.role ?? ""), "metadata.role"),
      date_applied: normalizeOptionalDate(String(normalized.date_applied ?? ""), "metadata.date_applied"),
      job_url: normalizeOptionalJobUrl(String(normalized.job_url ?? "")),
      location: normalizeOptionalText(String(normalized.location ?? ""), "metadata.location"),
      next_follow_up_date: normalizeOptionalDate(String(normalized.next_follow_up_date ?? ""), "metadata.next_follow_up_date")
    };
  }

  const problemType = normalizeOptionalText(String(normalized.problem_type ?? ""), "metadata.problem_type");
  return problemType ? { problem_type: problemType } : {};
}

function workspaceDir(workspaceId: string) {
  return path.join(getWorkspacesRootDir(), safeId(workspaceId));
}

function subjectsPath(workspaceId: string) {
  return path.join(workspaceDir(workspaceId), genericSubjectFileName);
}

function tasksPath(workspaceId: string) {
  return path.join(workspaceDir(workspaceId), genericTaskFileName);
}

function workspaceNotesPath(workspaceId: string) {
  return path.join(workspaceDir(workspaceId), "notes.md");
}

function subjectNotesPath(workspaceId: string, subjectId: string) {
  return path.join(workspaceDir(workspaceId), "subjects", safeId(subjectId), "notes.md");
}

async function readOptionalFile(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return "";
    }

    throw new WorkspaceStoreError(`Unable to read ${filePath}: ${getErrorMessage(error)}`, 500);
  }
}

async function getUpdatedAt(filePath: string) {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime.toISOString();
  } catch {
    return "";
  }
}

function compareWorkspaces(left: WorkspaceSummary, right: WorkspaceSummary) {
  if (left.kind !== right.kind) {
    return left.kind === "learning" ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

function uniqueWorkspaceId(name: string, existing: GenericWorkspaceRecord[]) {
  const base = slugify(name) || "workspace";
  const existingIds = new Set(existing.map((workspace) => workspace.id));
  let candidate = base;
  let suffix = 2;

  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function uniqueSubjectSlug(name: string, subjects: SubjectSummary[]) {
  const base = slugify(name) || "subject";
  const existing = new Set(subjects.map((subject) => subject.id));
  let candidate = base;
  let suffix = 2;

  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function requireText(value: string, field: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new WorkspaceStoreError(`${field} is required`, 400);
  }

  if (Buffer.byteLength(normalized, "utf8") > maxTextBytes) {
    throw new WorkspaceStoreError(`${field} is too large`, 400);
  }

  return normalized;
}

function normalizeOptionalText(value: string, field: string) {
  const normalized = value.trim();

  if (Buffer.byteLength(normalized, "utf8") > maxTextBytes) {
    throw new WorkspaceStoreError(`${field} is too large`, 400);
  }

  return normalized;
}

function labelForLearningStatus(status: string) {
  if (status === "not_started") return "Planned";
  if (status === "review_again") return "Review";
  if (status === "done") return "Done";
  if (status === "skipped") return "Archived";
  return "In Progress";
}

function labelForValue(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function legacyFallbackCardId(row: ActivityRowWithIndex) {
  return `legacy-row-${row.row_index}`;
}

function legacyPlanWorkspaceId(planId: string) {
  return `plan-${planId}`;
}

function getLocalDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringifyRecord(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).map(([key, fieldValue]) => [key, String(fieldValue ?? "")]));
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isPathInside(targetPath: string, rootPath: string) {
  const relative = path.relative(rootPath, targetPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
