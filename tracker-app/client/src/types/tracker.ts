export const categories = [
  "arrays_hashing",
  "two_pointers",
  "stack",
  "sliding_window",
  "binary_search",
  "linked_list",
  "trees",
  "trie",
  "heap",
  "intervals",
  "backtracking",
  "graphs",
  "dp_1d",
  "system_design",
  "behavioral",
  "review"
] as const;

export const itemTypes = [
  "leetcode_new",
  "leetcode_review",
  "system_design",
  "behavioral",
  "notes_review"
] as const;

export const difficulties = ["easy", "medium", "hard"] as const;
export const statuses = ["not_started", "in_progress", "done", "review_again", "skipped"] as const;
export const attemptTypes = ["first_try", "re_solve", "timed", "mock"] as const;
export const results = [
  "solved_alone",
  "solved_with_hint",
  "needed_solution",
  "partial",
  "review_only",
  "explained_only"
] as const;
export const interviewRelevanceValues = ["high", "medium", "low"] as const;

export type Category = (typeof categories)[number];
export type ItemType = (typeof itemTypes)[number];
export type Difficulty = (typeof difficulties)[number] | "";
export type Status = (typeof statuses)[number];
export type AttemptType = (typeof attemptTypes)[number] | "";
export type Result = (typeof results)[number] | "";
export type InterviewRelevance = (typeof interviewRelevanceValues)[number];

export interface ActivityRow {
  row_id: string;
  row_index: number;
  date: string;
  category: Category;
  item_type: ItemType;
  item_name: string;
  difficulty: Difficulty;
  status: Status;
  time_spent_min: string;
  confidence: string;
  attempt_type: AttemptType;
  result: Result;
  pattern: string;
  interview_relevance: InterviewRelevance;
  scheduled_date: string;
  completed_at: string;
  source: string;
  notes: string;
}

export type ActivityInput = Omit<ActivityRow, "row_index" | "row_id">;

export type PlanRevisionStatus = "ready" | "codex_completed" | "codex_not_configured" | "codex_failed";

export interface PlanSummary {
  id: string;
  name: string;
  csv_path: string;
  markdown_path: string;
  prompt_path: string;
  created_at: string;
  updated_at: string;
  revision_status: PlanRevisionStatus;
  revision_message: string;
  source_files: string[];
  base_plan_id?: string;
}

export interface MarkdownPlanFile {
  filename: string;
  content: string;
}

export type PlanJobStatus = "queued" | "running" | "completed" | "failed";

export interface PlanProgressMessage {
  timestamp: string;
  message: string;
}

export interface PlanJobSnapshot {
  id: string;
  status: PlanJobStatus;
  created_at: string;
  updated_at: string;
  messages: PlanProgressMessage[];
  plan?: PlanSummary;
  error?: string;
}

export interface PlanWorkspaceMigrationResult {
  workspace: WorkspaceSummary;
  migrated_card_count: number;
  deleted_plan_id: string;
}

export interface MarkdownSource {
  id: string;
  filename: string;
  stored_path: string;
  created_at: string;
  updated_at: string;
  byte_length: number;
}

export type ChatRole = "user" | "assistant";
export type ChatMode = "general" | "adaptive_progress";
export type ChatJobStatus = "queued" | "running" | "completed" | "failed";

export interface CsvPreview {
  id: string;
  status: "valid" | "invalid";
  csv: string;
  rows: ActivityInput[];
  errors: string[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
  mode?: ChatMode;
  plan_id?: string;
  workspace_id?: string;
  source_ids?: string[];
  target_date?: string;
  preview?: CsvPreview;
}

export interface ChatSession {
  id: string;
  title: string;
  workspace_id?: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface ChatJobSnapshot {
  id: string;
  session_id: string;
  status: ChatJobStatus;
  created_at: string;
  updated_at: string;
  messages: PlanProgressMessage[];
  assistant_message?: ChatMessage;
  error?: string;
}

export type CodeVisualizationSourceType = "chat" | "learning_session";

export interface CodeVisualizationRequest {
  sourceType: CodeVisualizationSourceType;
  sessionId: string;
  messageId: string;
  codeBlockIndex: number;
}

export interface CodeVisualizationStep {
  stepIndex: number;
  lineNumber: number;
  lineText: string;
  variables: Record<string, string>;
  explanation: string;
  output?: string;
}

export interface CodeVisualizationResponse {
  language: "python";
  code: string;
  steps: CodeVisualizationStep[];
  summary?: string;
  assumptions?: string[];
}

export type LearningSessionStatus = "drafting" | "active" | "ready_for_review" | "completed";
export type LearningSessionRole = "user" | "codex";
export type LearningSessionJobStatus = "queued" | "running" | "completed" | "failed";
export type LearningSessionJobType = "draft_lesson" | "message" | "evaluation";

export interface LearningSessionMessage {
  id: string;
  role: LearningSessionRole;
  content: string;
  created_at: string;
}

export interface LearningSessionEvaluation {
  status: Status;
  confidence: string;
  time_spent_min: string;
  result: Result;
  notes: string;
  strengths: string;
  weaknesses: string;
  next_focus: string;
}

export interface LearningSession {
  id: string;
  plan_id?: string;
  workspace_id?: string;
  row_index?: number;
  card_id?: string;
  title: string;
  status: LearningSessionStatus;
  row_snapshot?: ActivityRow;
  card_snapshot?: WorkspaceCard;
  lesson_outline: string;
  messages: LearningSessionMessage[];
  evaluation?: LearningSessionEvaluation;
  approved_evaluation?: LearningSessionEvaluation;
  created_at: string;
  updated_at: string;
}

export interface LearningSessionJobSnapshot {
  id: string;
  session_id: string;
  type: LearningSessionJobType;
  status: LearningSessionJobStatus;
  created_at: string;
  updated_at: string;
  messages: PlanProgressMessage[];
  session?: LearningSession;
  error?: string;
}


export interface KnowledgeBaseSnapshot {
  path: string;
  content: string;
  updated_at: string;
}

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

export interface WorkspaceNotesSnapshot {
  path: string;
  content: string;
  updated_at: string;
}

export type NotebookCellType = "markdown" | "python" | "prompt";
export type NotebookCellExecutionStatus = "idle" | "running" | "completed" | "failed";
export type NotebookCellOutputKind = "stream" | "result" | "error" | "codex";

export interface NotebookCellOutput {
  id: string;
  kind: NotebookCellOutputKind;
  content: string;
  created_at: string;
}

export interface NotebookCell {
  id: string;
  type: NotebookCellType;
  source: string;
  outputs: NotebookCellOutput[];
  execution_status: NotebookCellExecutionStatus;
  updated_at: string;
}

export interface WorkspaceNotebook {
  id: string;
  name: string;
  path: string;
  legacy_notes_path: string;
  updated_at: string;
  cells: NotebookCell[];
}

export interface WorkspaceNotebookSummary {
  id: string;
  name: string;
  path: string;
  updated_at: string;
}

export interface ProfileSnapshot {
  path: string;
  resume_filename: string;
  resume_content: string;
  background_notes: string;
  updated_at: string;
}

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

export type JobApplicationInput = Omit<JobApplicationRecord, "id" | "created_at" | "updated_at">;

export const emptyJobApplicationInput: JobApplicationInput = {
  company: "",
  role: "",
  status: "applied",
  date_applied: getLocalDate(),
  job_url: "",
  location: "",
  next_follow_up_date: "",
  notes: ""
};

export const emptyActivityInput: ActivityInput = {
  date: getLocalDate(),
  category: "arrays_hashing",
  item_type: "leetcode_new",
  item_name: "",
  difficulty: "",
  status: "not_started",
  time_spent_min: "",
  confidence: "",
  attempt_type: "",
  result: "",
  pattern: "",
  interview_relevance: "high",
  scheduled_date: "",
  completed_at: "",
  source: "custom",
  notes: ""
};

export function labelFor(value: string) {
  if (!value) {
    return "";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getLocalDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
