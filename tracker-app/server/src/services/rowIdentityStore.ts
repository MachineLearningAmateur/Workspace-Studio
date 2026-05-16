import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import type { ActivityRow } from "./csvStore.js";

interface RowIdentitySnapshot {
  row_id: string;
  date: string;
  category: string;
  item_type: string;
  item_name: string;
  source: string;
  scheduled_date: string;
}

interface RowIdentityFile {
  rows: RowIdentitySnapshot[];
}

export async function syncActivityRowIds(csvPath: string, rows: ActivityRow[]) {
  const previous = await readIdentityFile(csvPath);
  const reusableIdsByKey = new Map<string, string[]>();

  for (const snapshot of previous.rows) {
    const key = toIdentityKey(snapshot);
    const existing = reusableIdsByKey.get(key) ?? [];
    existing.push(snapshot.row_id);
    reusableIdsByKey.set(key, existing);
  }

  const usedIds = new Set<string>();
  const rowsWithIds = rows.map((row) => {
    const explicitId = row.row_id.trim();

    if (explicitId && !usedIds.has(explicitId)) {
      usedIds.add(explicitId);
      return { ...row, row_id: explicitId };
    }

    const key = toIdentityKey(row);
    const queue = reusableIdsByKey.get(key) ?? [];
    const reusableId = queue.find((candidate) => !usedIds.has(candidate));

    if (reusableId) {
      usedIds.add(reusableId);
      return { ...row, row_id: reusableId };
    }

    const rowId = randomUUID();
    usedIds.add(rowId);
    return { ...row, row_id: rowId };
  });

  await writeIdentityFile(csvPath, rowsWithIds.map(toIdentitySnapshot));
  return rowsWithIds;
}

export function getRowIdentitySnapshot(row: ActivityRow) {
  return toIdentitySnapshot(row);
}

function toIdentitySnapshot(row: ActivityRow): RowIdentitySnapshot {
  return {
    row_id: row.row_id.trim(),
    date: row.date,
    category: row.category,
    item_type: row.item_type,
    item_name: row.item_name,
    source: row.source,
    scheduled_date: row.scheduled_date
  };
}

function toIdentityKey(row: Pick<RowIdentitySnapshot, "date" | "category" | "item_type" | "item_name" | "source" | "scheduled_date">) {
  return JSON.stringify([
    row.date,
    row.category,
    row.item_type,
    row.item_name,
    row.source,
    row.scheduled_date
  ]);
}

async function readIdentityFile(csvPath: string): Promise<RowIdentityFile> {
  try {
    const raw = await fs.readFile(getIdentityFilePath(csvPath), "utf8");
    const parsed = JSON.parse(raw) as RowIdentityFile;
    return Array.isArray(parsed.rows) ? parsed : { rows: [] };
  } catch (error) {
    if (isFileNotFound(error)) {
      return { rows: [] };
    }

    throw error;
  }
}

async function writeIdentityFile(csvPath: string, rows: RowIdentitySnapshot[]) {
  const filePath = getIdentityFilePath(csvPath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify({ rows }, null, 2)}\n`, "utf8");
  await replaceFileWithRetry(tempPath, filePath);
}

function getIdentityFilePath(csvPath: string) {
  return `${csvPath}.row-ids.json`;
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function replaceFileWithRetry(tempPath: string, targetPath: string) {
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rename(tempPath, targetPath);
      return;
    } catch (error) {
      if (isFileNotFound(error)) {
        try {
          await fs.access(targetPath);
          return;
        } catch {
          throw error;
        }
      }

      if (!isRetryableReplaceError(error) || attempt === maxAttempts) {
        throw error;
      }

      await delay(attempt * 40);
    }
  }
}

function isRetryableReplaceError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "EPERM" || error.code === "EACCES" || error.code === "EBUSY")
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
