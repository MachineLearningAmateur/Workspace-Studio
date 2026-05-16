import type {
  ActivityInput,
  ActivityRow,
  CodeVisualizationRequest,
  CodeVisualizationResponse,
  ChatJobSnapshot,
  ChatMode,
  ChatSession,
  JobApplicationInput,
  JobApplicationRecord,
  KnowledgeBaseSnapshot,
  LearningSession,
  LearningSessionEvaluation,
  LearningSessionJobSnapshot,
  LearningSessionJobType,
  MarkdownPlanFile,
  MarkdownSource,
  PlanJobSnapshot,
  PlanSummary,
  PlanWorkspaceMigrationResult,
  ProfileSnapshot,
  SubjectSummary,
  WorkspaceCard,
  WorkspaceNotebook,
  WorkspaceNotebookSummary,
  WorkspaceKind,
  WorkspaceNotesSnapshot,
  WorkspaceSummary
} from "../types/tracker";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? "Request failed");
  }

  return response.json();
}

export function getJobApplications() {
  return request<JobApplicationRecord[]>("/api/job-applications");
}

export function createJobApplication(input: JobApplicationInput) {
  return request<JobApplicationRecord>("/api/job-applications", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateJobApplication(id: string, input: JobApplicationInput) {
  return request<JobApplicationRecord>(`/api/job-applications/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function updateJobApplicationStatus(id: string, status: JobApplicationInput["status"]) {
  return request<JobApplicationRecord>(`/api/job-applications/${encodeURIComponent(id)}/status`, {
    method: "PUT",
    body: JSON.stringify({ status })
  });
}

export function deleteJobApplication(id: string) {
  return request<JobApplicationRecord>(`/api/job-applications/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export function getPlans() {
  return request<PlanSummary[]>("/api/plans");
}

export function createPlan(input: { name: string; basePlanId?: string; files: MarkdownPlanFile[] }) {
  return request<PlanSummary>("/api/plans", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function startPlanJob(input: { name: string; basePlanId?: string; files: MarkdownPlanFile[] }) {
  return request<PlanJobSnapshot>("/api/plans/jobs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getPlanJob(jobId: string) {
  return request<PlanJobSnapshot>(`/api/plans/jobs/${encodeURIComponent(jobId)}`);
}

export function deletePlan(planId: string) {
  return request<PlanSummary>(`/api/plans/${encodeURIComponent(planId)}`, {
    method: "DELETE"
  });
}

export function migratePlanToWorkspace(planId: string) {
  return request<PlanWorkspaceMigrationResult>(`/api/plans/${encodeURIComponent(planId)}/migrate-to-workspace`, {
    method: "POST"
  });
}

export function getSources() {
  return request<MarkdownSource[]>("/api/sources");
}

export function createSource(input: { filename: string; content: string }) {
  return request<MarkdownSource>("/api/sources", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function deleteSource(sourceId: string) {
  return request<MarkdownSource>(`/api/sources/${encodeURIComponent(sourceId)}`, {
    method: "DELETE"
  });
}

export function getChatSessions(workspaceId?: string) {
  const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
  return request<ChatSession[]>(`/api/chat/sessions${query}`);
}

export function createChatSession(input: { title?: string; workspaceId?: string } = {}) {
  return request<ChatSession>("/api/chat/sessions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getChatSession(sessionId: string) {
  return request<ChatSession>(`/api/chat/sessions/${encodeURIComponent(sessionId)}`);
}

export function deleteChatSession(sessionId: string) {
  return request<ChatSession>(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE"
  });
}

export function startChatJob(input: {
  sessionId?: string;
  prompt: string;
  mode: ChatMode;
  planId?: string;
  workspaceId?: string;
  sourceIds: string[];
  attachments?: { filename: string; content: string }[];
  targetDate?: string;
}) {
  return request<ChatJobSnapshot>("/api/chat/jobs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getChatJob(jobId: string) {
  return request<ChatJobSnapshot>(`/api/chat/jobs/${encodeURIComponent(jobId)}`);
}

export function createCodeVisualization(input: CodeVisualizationRequest) {
  return request<CodeVisualizationResponse>("/api/code-visualizations", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function saveChatPreview(
  sessionId: string,
  messageId: string,
  input:
    | { action: "new_plan"; planName: string; basePlanId?: string }
    | { action: "append_plan"; planId: string }
    | { action: "replace_plan"; planId: string }
) {
  return request<PlanSummary>(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/save-preview`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getLearningSessions(input: { planId?: string; workspaceId?: string } = {}) {
  const params = new URLSearchParams();

  if (input.planId) {
    params.set("planId", input.planId);
  }

  if (input.workspaceId) {
    params.set("workspaceId", input.workspaceId);
  }

  const query = params.toString();
  return request<LearningSession[]>(`/api/learning-sessions${query ? `?${query}` : ""}`);
}

export function createLearningSession(input: { planId: string; rowIndex: number } | { workspaceId: string; cardId: string }) {
  return request<LearningSession>("/api/learning-sessions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getLearningSession(sessionId: string) {
  return request<LearningSession>(`/api/learning-sessions/${encodeURIComponent(sessionId)}`);
}

export function deleteLearningSession(sessionId: string) {
  return request<LearningSession>(`/api/learning-sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE"
  });
}

export function startLearningSessionJob(input: { sessionId: string; type: LearningSessionJobType; prompt?: string }) {
  return request<LearningSessionJobSnapshot>(`/api/learning-sessions/${encodeURIComponent(input.sessionId)}/jobs`, {
    method: "POST",
    body: JSON.stringify({
      type: input.type,
      prompt: input.prompt
    })
  });
}

export function getLearningSessionJobs(input: { planId?: string; workspaceId?: string; active?: boolean } = {}) {
  const params = new URLSearchParams();

  if (input.planId) {
    params.set("planId", input.planId);
  }

  if (input.workspaceId) {
    params.set("workspaceId", input.workspaceId);
  }

  if (input.active) {
    params.set("active", "1");
  }

  const query = params.toString();
  return request<LearningSessionJobSnapshot[]>(`/api/learning-sessions/jobs${query ? `?${query}` : ""}`);
}

export function getLearningSessionJob(jobId: string) {
  return request<LearningSessionJobSnapshot>(`/api/learning-sessions/jobs/${encodeURIComponent(jobId)}`);
}

export function applyLearningEvaluation(sessionId: string, evaluation: LearningSessionEvaluation) {
  return request<{ session: LearningSession; row?: ActivityRow; card?: WorkspaceCard; knowledgeBase: KnowledgeBaseSnapshot }>(
    `/api/learning-sessions/${encodeURIComponent(sessionId)}/apply-evaluation`,
    {
      method: "POST",
      body: JSON.stringify(evaluation)
    }
  );
}

export function getKnowledgeBase() {
  return request<KnowledgeBaseSnapshot>("/api/knowledge-base");
}

export function rebuildKnowledgeBase() {
  return request<KnowledgeBaseSnapshot>("/api/knowledge-base/rebuild", {
    method: "POST"
  });
}

export function getProfile() {
  return request<ProfileSnapshot>("/api/profile");
}

export function saveProfile(input: { resume_filename: string; resume_content: string; background_notes: string }) {
  return request<ProfileSnapshot>("/api/profile", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function generateProfileBackground(input: { resume_filename: string; resume_content: string; existing_background_notes: string }) {
  return request<{ background_notes: string }>("/api/profile/generate-background", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function clearProfile() {
  return request<ProfileSnapshot>("/api/profile", {
    method: "DELETE"
  });
}

export function getActivityRows(planId: string) {
  return request<ActivityRow[]>(trackerUrl(planId));
}

export function addActivityRow(planId: string, input: ActivityInput) {
  return request<ActivityRow>(trackerUrl(planId), {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateActivityRow(planId: string, rowIndex: number, input: ActivityInput) {
  return request<ActivityRow>(trackerUrl(planId, rowIndex), {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function deleteActivityRow(planId: string, rowIndex: number) {
  return request<ActivityRow>(trackerUrl(planId, rowIndex), {
    method: "DELETE"
  });
}

function trackerUrl(planId: string, rowIndex?: number) {
  const path = typeof rowIndex === "number" ? `/api/tracker/${rowIndex}` : "/api/tracker";
  return `${path}?planId=${encodeURIComponent(planId)}`;
}

export function getWorkspaces() {
  return request<WorkspaceSummary[]>("/api/workspaces");
}

export function createWorkspace(input: { name: string; description?: string; kind?: WorkspaceKind }) {
  return request<WorkspaceSummary>("/api/workspaces", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function deleteWorkspace(workspaceId: string) {
  return request<WorkspaceSummary>(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "DELETE"
  });
}

export function getWorkspaceSubjects(workspaceId: string) {
  return request<SubjectSummary[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/subjects`);
}

export function createWorkspaceSubject(workspaceId: string, input: { name: string }) {
  return request<SubjectSummary>(`/api/workspaces/${encodeURIComponent(workspaceId)}/subjects`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getWorkspaceCards(workspaceId: string) {
  return request<WorkspaceCard[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/cards`);
}

export function createWorkspaceCard(
  workspaceId: string,
  input: { subject_id?: string; title: string; status?: string; notes?: string; tags?: string[]; metadata?: Record<string, string> }
) {
  return request<WorkspaceCard>(`/api/workspaces/${encodeURIComponent(workspaceId)}/cards`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateWorkspaceCard(
  workspaceId: string,
  cardId: string,
  input: { subject_id?: string; title?: string; status?: string; notes?: string; tags?: string[]; metadata?: Record<string, string> }
) {
  return request<WorkspaceCard>(`/api/workspaces/${encodeURIComponent(workspaceId)}/cards/${encodeURIComponent(cardId)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteWorkspaceCard(workspaceId: string, cardId: string) {
  return request<WorkspaceCard>(`/api/workspaces/${encodeURIComponent(workspaceId)}/cards/${encodeURIComponent(cardId)}`, {
    method: "DELETE"
  });
}

export function getWorkspaceNotes(workspaceId: string) {
  return request<WorkspaceNotesSnapshot>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notes`);
}

export function saveWorkspaceNotes(workspaceId: string, content: string) {
  return request<WorkspaceNotesSnapshot>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notes`, {
    method: "PUT",
    body: JSON.stringify({ content })
  });
}

export function getWorkspaceNotebook(workspaceId: string) {
  return request<WorkspaceNotebookSummary[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notebook`);
}

export function getWorkspaceNotebookById(workspaceId: string, notebookId: string) {
  return request<WorkspaceNotebook>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notebook/${encodeURIComponent(notebookId)}`);
}

export function createWorkspaceNotebook(workspaceId: string, input: { name: string }) {
  return request<WorkspaceNotebook>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notebook`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function renameWorkspaceNotebook(workspaceId: string, notebookId: string, input: { name: string }) {
  return request<WorkspaceNotebook>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notebook/${encodeURIComponent(notebookId)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteWorkspaceNotebook(workspaceId: string, notebookId: string) {
  return request<WorkspaceNotebookSummary>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notebook/${encodeURIComponent(notebookId)}`, {
    method: "DELETE"
  });
}

export function saveWorkspaceNotebook(workspaceId: string, notebookId: string, input: { cells: WorkspaceNotebook["cells"] }) {
  return request<WorkspaceNotebook>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notebook/${encodeURIComponent(notebookId)}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function runWorkspaceNotebookPythonCell(workspaceId: string, notebookId: string, cellId: string) {
  return request<WorkspaceNotebook>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/notebook/${encodeURIComponent(notebookId)}/cells/${encodeURIComponent(cellId)}/run-python`,
    {
      method: "POST"
    }
  );
}

export function askCodexForWorkspaceNotebookCell(workspaceId: string, notebookId: string, cellId: string) {
  return request<WorkspaceNotebook>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/notebook/${encodeURIComponent(notebookId)}/cells/${encodeURIComponent(cellId)}/ask-codex`,
    {
      method: "POST"
    }
  );
}
