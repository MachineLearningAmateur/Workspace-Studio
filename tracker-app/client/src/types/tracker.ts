export const categories = [
  "arrays_hashing",
  "two_pointers",
  "stack",
  "sliding_window",
  "binary_search",
  "linked_list",
  "trees",
  "heap",
  "intervals",
  "backtracking",
  "graphs",
  "dp_1d",
  "system_design",
  "behavioral",
  "mock_interview",
  "review"
] as const;

export const itemTypes = [
  "leetcode_new",
  "leetcode_review",
  "system_design",
  "behavioral",
  "mock",
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

export type ActivityInput = Omit<ActivityRow, "row_index">;

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
