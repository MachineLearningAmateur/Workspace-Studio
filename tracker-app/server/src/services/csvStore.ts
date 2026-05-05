import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export const activityColumns = [
  "date",
  "category",
  "item_type",
  "item_name",
  "difficulty",
  "status",
  "time_spent_min",
  "confidence",
  "attempt_type",
  "result",
  "pattern",
  "interview_relevance",
  "scheduled_date",
  "completed_at",
  "source",
  "notes"
] as const;

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

export type ActivityColumn = (typeof activityColumns)[number];
export type Category = (typeof categories)[number];
export type ItemType = (typeof itemTypes)[number];
export type Difficulty = (typeof difficulties)[number] | "";
export type Status = (typeof statuses)[number];
export type AttemptType = (typeof attemptTypes)[number] | "";
export type Result = (typeof results)[number] | "";
export type InterviewRelevance = (typeof interviewRelevanceValues)[number];

export interface ActivityRow {
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

export type ActivityRowWithIndex = ActivityRow & { row_index: number };
export type ActivityInput = Partial<Record<ActivityColumn, string>>;

export class CsvStoreError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

const headerLine = `${activityColumns.join(",")}\n`;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/;

const categorySet = new Set<string>(categories);
const itemTypeSet = new Set<string>(itemTypes);
const difficultySet = new Set<string>(difficulties);
const statusSet = new Set<string>(statuses);
const attemptTypeSet = new Set<string>(attemptTypes);
const resultSet = new Set<string>(results);
const relevanceSet = new Set<string>(interviewRelevanceValues);

export function getTrackerCsvPath() {
  return path.resolve(process.env.TRACKER_CSV_PATH ?? "./data/study_activities.csv");
}

export async function ensureTrackerFile(csvPath = getTrackerCsvPath()) {
  try {
    await fs.access(csvPath, constants.F_OK);
  } catch {
    await fs.mkdir(path.dirname(csvPath), { recursive: true });
    await fs.writeFile(csvPath, headerLine, "utf8");
  }
}

export async function loadActivityRows(csvPath = getTrackerCsvPath()): Promise<ActivityRowWithIndex[]> {
  await ensureTrackerFile(csvPath);

  let records: Record<string, string>[];
  try {
    const csv = await fs.readFile(csvPath, "utf8");
    records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: false
    });
  } catch (error) {
    throw new CsvStoreError(`Unable to read tracker CSV: ${getErrorMessage(error)}`, 500);
  }

  validateHeaderAndRows(records);
  return records.map((record, index) => ({ ...normalizeRow(record), row_index: index }));
}

export async function appendActivityRow(input: ActivityInput, csvPath = getTrackerCsvPath()) {
  await ensureTrackerFile(csvPath);
  const row = validateAndNormalizeInput(input);
  const line = stringify([row], { columns: activityColumns });

  try {
    await fs.appendFile(csvPath, line, "utf8");
  } catch (error) {
    throw new CsvStoreError(`Unable to append tracker CSV row: ${getErrorMessage(error)}`, 500);
  }

  const rows = await loadActivityRows(csvPath);
  return rows[rows.length - 1];
}

export async function updateActivityRow(rowIndex: number, input: ActivityInput, csvPath = getTrackerCsvPath()) {
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    throw new CsvStoreError("Invalid row index", 400);
  }

  const rows = await loadActivityRows(csvPath);
  if (rowIndex >= rows.length) {
    throw new CsvStoreError(`Tracker row not found for index ${rowIndex}`, 404);
  }

  const current = stripRowIndex(rows[rowIndex]);
  const updated = validateAndNormalizeInput({ ...current, ...pickActivityFields(input) });
  const nextRows = rows.map((row, index) => (index === rowIndex ? updated : stripRowIndex(row)));
  await saveActivityRows(nextRows, csvPath);
  return { ...updated, row_index: rowIndex };
}

export async function resetActivityRows(csvPath = getTrackerCsvPath()) {
  await fs.mkdir(path.dirname(csvPath), { recursive: true });
  await safeWriteFile(csvPath, headerLine);
  return loadActivityRows(csvPath);
}

async function saveActivityRows(rows: ActivityRow[], csvPath: string) {
  validateHeaderAndRows(rows);
  const csv = stringify(rows, {
    header: true,
    columns: activityColumns
  });

  try {
    await safeWriteFile(csvPath, csv);
  } catch (error) {
    throw new CsvStoreError(`Unable to write tracker CSV: ${getErrorMessage(error)}`, 500);
  }
}

async function safeWriteFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

function validateHeaderAndRows(records: Array<Record<string, string> | ActivityRow>) {
  for (const record of records) {
    for (const column of activityColumns) {
      if (!(column in record)) {
        throw new CsvStoreError(`Malformed CSV: missing required column "${column}"`, 400);
      }
    }

    validateRow(normalizeRow(record as Partial<Record<ActivityColumn, string>>));
  }
}

function validateAndNormalizeInput(input: ActivityInput): ActivityRow {
  const row = normalizeRow(pickActivityFields(input));
  validateRow(row);
  return row;
}

function validateRow(row: ActivityRow) {
  requireDate(row.date, "date");
  requireEnum(row.category, categorySet, "category");
  requireEnum(row.item_type, itemTypeSet, "item_type");
  requireText(row.item_name, "item_name");
  optionalEnum(row.difficulty, difficultySet, "difficulty");
  requireEnum(row.status, statusSet, "status");
  optionalNonNegativeInteger(row.time_spent_min, "time_spent_min");
  optionalIntegerRange(row.confidence, "confidence", 1, 5);
  optionalEnum(row.attempt_type, attemptTypeSet, "attempt_type");
  optionalEnum(row.result, resultSet, "result");
  requireEnum(row.interview_relevance, relevanceSet, "interview_relevance");
  optionalDate(row.scheduled_date, "scheduled_date");
  optionalTimestamp(row.completed_at, "completed_at");
}

function normalizeRow(record: Partial<Record<ActivityColumn, string>>): ActivityRow {
  return {
    date: record.date ?? "",
    category: (record.category ?? "") as Category,
    item_type: (record.item_type ?? "") as ItemType,
    item_name: record.item_name ?? "",
    difficulty: (record.difficulty ?? "") as Difficulty,
    status: (record.status ?? "") as Status,
    time_spent_min: record.time_spent_min ?? "",
    confidence: record.confidence ?? "",
    attempt_type: (record.attempt_type ?? "") as AttemptType,
    result: (record.result ?? "") as Result,
    pattern: record.pattern ?? "",
    interview_relevance: (record.interview_relevance ?? "") as InterviewRelevance,
    scheduled_date: record.scheduled_date ?? "",
    completed_at: record.completed_at ?? "",
    source: record.source ?? "",
    notes: record.notes ?? ""
  };
}

function pickActivityFields(input: ActivityInput) {
  return Object.fromEntries(Object.entries(input).filter(([key]) => activityColumns.includes(key as ActivityColumn)));
}

function stripRowIndex(row: ActivityRowWithIndex): ActivityRow {
  const { row_index: _rowIndex, ...activityRow } = row;
  return activityRow;
}

function requireDate(value: string, field: string) {
  requireText(value, field);
  if (!datePattern.test(value)) {
    throw new CsvStoreError(`${field} must use YYYY-MM-DD`, 400);
  }
}

function optionalDate(value: string, field: string) {
  if (value && !datePattern.test(value)) {
    throw new CsvStoreError(`${field} must use YYYY-MM-DD`, 400);
  }
}

function optionalTimestamp(value: string, field: string) {
  if (value && !isoTimestampPattern.test(value)) {
    throw new CsvStoreError(`${field} must be an ISO-like timestamp`, 400);
  }
}

function requireText(value: string, field: string) {
  if (!value.trim()) {
    throw new CsvStoreError(`${field} is required`, 400);
  }
}

function requireEnum(value: string, allowed: Set<string>, field: string) {
  requireText(value, field);
  if (!allowed.has(value)) {
    throw new CsvStoreError(`${field} has invalid value "${value}"`, 400);
  }
}

function optionalEnum(value: string, allowed: Set<string>, field: string) {
  if (value && !allowed.has(value)) {
    throw new CsvStoreError(`${field} has invalid value "${value}"`, 400);
  }
}

function optionalNonNegativeInteger(value: string, field: string) {
  if (!value) {
    return;
  }

  if (!/^\d+$/.test(value)) {
    throw new CsvStoreError(`${field} must be an integer >= 0`, 400);
  }
}

function optionalIntegerRange(value: string, field: string, min: number, max: number) {
  if (!value) {
    return;
  }

  if (!/^\d+$/.test(value)) {
    throw new CsvStoreError(`${field} must be an integer from ${min} to ${max}`, 400);
  }

  const parsed = Number(value);
  if (parsed < min || parsed > max) {
    throw new CsvStoreError(`${field} must be an integer from ${min} to ${max}`, 400);
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
