import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { buildWorkspaceChatContext, getWorkspace, WorkspaceStoreError } from "./workspaceStore.js";

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

interface WorkspaceNotebookFile {
  version: 1;
  cells: NotebookCell[];
}

interface WorkspaceNotebookIndexEntry {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceNotebookIndexFile {
  version: 1;
  notebooks: WorkspaceNotebookIndexEntry[];
}

interface PythonRuntime {
  process: ChildProcessWithoutNullStreams;
  buffer: string;
  pending: Map<string, { resolve: (value: PythonExecutionResponse) => void; reject: (error: Error) => void }>;
}

interface PythonExecutionResponse {
  id: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  result?: string;
  error?: string;
}

const pythonRuntimes = new Map<string, PythonRuntime>();
const defaultNotebookCodexCommand =
  'codex exec --skip-git-repo-check --sandbox read-only --ephemeral --json --output-last-message "{outputFile}" -';
const pythonRuntimeScript = `
import ast
import contextlib
import io
import json
import sys
import traceback

scope = {"__name__": "__main__"}

for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue

    req = json.loads(line)
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    response = {"id": req.get("id", ""), "ok": True, "stdout": "", "stderr": "", "result": ""}

    try:
        source = str(req.get("code", ""))
        module = ast.parse(source, mode="exec")
        trailing_expression = None

        if module.body and isinstance(module.body[-1], ast.Expr):
            trailing_expression = ast.Expression(module.body.pop().value)

        with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
            exec(compile(module, "<workspace-notebook>", "exec"), scope)
            if trailing_expression is not None:
                value = eval(compile(trailing_expression, "<workspace-notebook>", "eval"), scope)
                if value is not None:
                    response["result"] = repr(value)
    except Exception:
        response["ok"] = False
        response["error"] = traceback.format_exc()

    response["stdout"] = stdout_buffer.getvalue()
    response["stderr"] = stderr_buffer.getvalue()
    print(json.dumps(response), flush=True)
`;

export class WorkspaceNotebookStoreError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

export async function getWorkspaceNotebook(workspaceId: string): Promise<WorkspaceNotebook> {
  const summaries = await listWorkspaceNotebooks(workspaceId);
  return getWorkspaceNotebookById(workspaceId, summaries[0]?.id);
}

export async function listWorkspaceNotebooks(workspaceId: string): Promise<WorkspaceNotebookSummary[]> {
  await getWorkspace(workspaceId);
  const index = await readNotebookIndexFile(workspaceId);
  return Promise.all(
    index.notebooks.map(async (entry) => ({
      id: entry.id,
      name: entry.name,
      path: getWorkspaceNotebookPath(workspaceId, entry.id),
      updated_at: await getUpdatedAt(getWorkspaceNotebookPath(workspaceId, entry.id))
    }))
  );
}

export async function createWorkspaceNotebook(workspaceId: string, input: { name: string }) {
  await getWorkspace(workspaceId);
  const index = await readNotebookIndexFile(workspaceId);
  const now = new Date().toISOString();
  const notebookId = safeId(input.name.trim()) || randomUUID();
  const uniqueNotebookId = findAvailableNotebookId(index.notebooks, notebookId);
  const entry: WorkspaceNotebookIndexEntry = {
    id: uniqueNotebookId,
    name: input.name.trim() || "Untitled Notebook",
    created_at: now,
    updated_at: now
  };
  index.notebooks.push(entry);
  await writeNotebookFile(workspaceId, entry.id, buildEmptyNotebookFile());
  await writeNotebookIndexFile(workspaceId, index);
  return getWorkspaceNotebookById(workspaceId, entry.id);
}

export async function renameWorkspaceNotebook(workspaceId: string, notebookId: string, input: { name: string }) {
  await getWorkspace(workspaceId);
  const index = await readNotebookIndexFile(workspaceId);
  const entry = index.notebooks.find((candidate) => candidate.id === notebookId);

  if (!entry) {
    throw new WorkspaceNotebookStoreError(`Notebook not found: ${notebookId}`, 404);
  }

  entry.name = input.name.trim() || entry.name;
  entry.updated_at = new Date().toISOString();
  await writeNotebookIndexFile(workspaceId, index);
  return getWorkspaceNotebookById(workspaceId, notebookId);
}

export async function deleteWorkspaceNotebook(workspaceId: string, notebookId: string) {
  await getWorkspace(workspaceId);
  const index = await readNotebookIndexFile(workspaceId);

  if (index.notebooks.length <= 1) {
    throw new WorkspaceNotebookStoreError("At least one notebook must remain in the workspace", 400);
  }

  const nextNotebooks = index.notebooks.filter((candidate) => candidate.id !== notebookId);
  if (nextNotebooks.length === index.notebooks.length) {
    throw new WorkspaceNotebookStoreError(`Notebook not found: ${notebookId}`, 404);
  }

  index.notebooks = nextNotebooks;
  await writeNotebookIndexFile(workspaceId, index);
  await fs.rm(getWorkspaceNotebookPath(workspaceId, notebookId), { force: true });
  return nextNotebooks[0];
}

export async function getWorkspaceNotebookById(workspaceId: string, notebookId?: string): Promise<WorkspaceNotebook> {
  await getWorkspace(workspaceId);
  const index = await readNotebookIndexFile(workspaceId);
  const entry = notebookId
    ? index.notebooks.find((candidate) => candidate.id === notebookId)
    : index.notebooks[0];

  if (!entry) {
    throw new WorkspaceNotebookStoreError("No notebook found for workspace", 404);
  }

  const notebookPath = getWorkspaceNotebookPath(workspaceId, entry.id);
  const legacyNotesPath = getLegacyWorkspaceNotesPath(workspaceId);
  const notebook = await readNotebookFile(workspaceId, entry.id);
  return {
    id: entry.id,
    name: entry.name,
    path: notebookPath,
    legacy_notes_path: legacyNotesPath,
    updated_at: await getUpdatedAt(notebookPath),
    cells: notebook.cells
  };
}

export async function saveWorkspaceNotebook(workspaceId: string, notebookId: string, input: { cells: NotebookCell[] }) {
  await getWorkspace(workspaceId);
  const index = await readNotebookIndexFile(workspaceId);
  const entry = index.notebooks.find((candidate) => candidate.id === notebookId);

  if (!entry) {
    throw new WorkspaceNotebookStoreError(`Notebook not found: ${notebookId}`, 404);
  }

  const notebook: WorkspaceNotebookFile = {
    version: 1,
    cells: normalizeNotebookCells(input.cells)
  };
  entry.updated_at = new Date().toISOString();
  await writeNotebookFile(workspaceId, notebookId, notebook);
  await writeNotebookIndexFile(workspaceId, index);
  await exportNotebookToLegacyMarkdown(workspaceId, notebook.cells);
  return getWorkspaceNotebookById(workspaceId, notebookId);
}

export async function runWorkspaceNotebookPythonCell(workspaceId: string, notebookId: string, cellId: string) {
  const notebook = await readNotebookFile(workspaceId, notebookId);
  const cell = notebook.cells.find((candidate) => candidate.id === cellId);

  if (!cell) {
    throw new WorkspaceNotebookStoreError(`Notebook cell not found: ${cellId}`, 404);
  }

  if (cell.type !== "python") {
    throw new WorkspaceNotebookStoreError("Only python cells can be executed", 400);
  }

  cell.execution_status = "running";
  cell.updated_at = new Date().toISOString();
  await writeNotebookFile(workspaceId, notebookId, notebook);

  const response = await runPythonInWorkspace(workspaceId, cell.source);
  cell.outputs = buildPythonOutputs(response);
  cell.execution_status = response.ok ? "completed" : "failed";
  cell.updated_at = new Date().toISOString();
  await writeNotebookFile(workspaceId, notebookId, notebook);
  await exportNotebookToLegacyMarkdown(workspaceId, notebook.cells);
  return getWorkspaceNotebookById(workspaceId, notebookId);
}

export async function askCodexForWorkspaceNotebookCell(workspaceId: string, notebookId: string, cellId: string) {
  const notebook = await readNotebookFile(workspaceId, notebookId);
  const cell = notebook.cells.find((candidate) => candidate.id === cellId);

  if (!cell) {
    throw new WorkspaceNotebookStoreError(`Notebook cell not found: ${cellId}`, 404);
  }

  if (cell.type !== "prompt") {
    throw new WorkspaceNotebookStoreError("Only prompt cells can ask Codex", 400);
  }

  cell.execution_status = "running";
  cell.updated_at = new Date().toISOString();
  await writeNotebookFile(workspaceId, notebookId, notebook);

  const response = await askCodexForNotebookCell(workspaceId, notebook.cells, cell.source);
  cell.outputs = [
    {
      id: randomUUID(),
      kind: "codex",
      content: response.trim(),
      created_at: new Date().toISOString()
    }
  ];
  cell.execution_status = "completed";
  cell.updated_at = new Date().toISOString();
  await writeNotebookFile(workspaceId, notebookId, notebook);
  await exportNotebookToLegacyMarkdown(workspaceId, notebook.cells);
  return getWorkspaceNotebookById(workspaceId, notebookId);
}

async function readNotebookFile(workspaceId: string, notebookId: string): Promise<WorkspaceNotebookFile> {
  const notebookPath = getWorkspaceNotebookPath(workspaceId, notebookId);

  try {
    const raw = await fs.readFile(notebookPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkspaceNotebookFile>;
    return {
      version: 1,
      cells: normalizeNotebookCells(parsed.cells)
    };
  } catch (error) {
    if (!isFileNotFound(error)) {
      throw new WorkspaceNotebookStoreError(`Unable to read workspace notebook: ${getErrorMessage(error)}`, 500);
    }
  }

  const migrated = await createNotebookFromLegacyNotes(workspaceId);
  await writeNotebookFile(workspaceId, notebookId, migrated);
  return migrated;
}

async function createNotebookFromLegacyNotes(workspaceId: string): Promise<WorkspaceNotebookFile> {
  const legacyContent = await readOptionalFile(getLegacyWorkspaceNotesPath(workspaceId));
  const cells: NotebookCell[] = legacyContent.trim()
    ? [
        {
          id: randomUUID(),
          type: "markdown",
          source: legacyContent.trim(),
          outputs: [],
          execution_status: "idle",
          updated_at: new Date().toISOString()
        }
      ]
    : [
        {
          id: randomUUID(),
          type: "markdown",
          source: "# Notes",
          outputs: [],
          execution_status: "idle",
          updated_at: new Date().toISOString()
        }
      ];

  return {
    version: 1,
    cells
  };
}

async function writeNotebookFile(workspaceId: string, notebookId: string, notebook: WorkspaceNotebookFile) {
  const notebookPath = getWorkspaceNotebookPath(workspaceId, notebookId);
  await fs.mkdir(path.dirname(notebookPath), { recursive: true });
  const tempPath = `${notebookPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify({ version: 1, cells: notebook.cells }, null, 2)}\n`, "utf8");
  await replaceFileWithRetry(tempPath, notebookPath);
}

async function readNotebookIndexFile(workspaceId: string): Promise<WorkspaceNotebookIndexFile> {
  const indexPath = getWorkspaceNotebookIndexPath(workspaceId);

  try {
    const raw = await fs.readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkspaceNotebookIndexFile>;
    const notebooks = Array.isArray(parsed.notebooks) ? parsed.notebooks.filter(isNotebookIndexEntry).map(normalizeNotebookIndexEntry) : [];
    if (notebooks.length > 0) {
      return { version: 1, notebooks };
    }
  } catch (error) {
    if (!isFileNotFound(error)) {
      throw new WorkspaceNotebookStoreError(`Unable to read workspace notebook index: ${getErrorMessage(error)}`, 500);
    }
  }

  const migrated = await migrateNotebookCollection(workspaceId);
  await writeNotebookIndexFile(workspaceId, migrated.index);
  await writeNotebookFile(workspaceId, migrated.entry.id, migrated.notebook);
  return migrated.index;
}

async function writeNotebookIndexFile(workspaceId: string, index: WorkspaceNotebookIndexFile) {
  const indexPath = getWorkspaceNotebookIndexPath(workspaceId);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  const tempPath = `${indexPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await replaceFileWithRetry(tempPath, indexPath);
}

async function migrateNotebookCollection(
  workspaceId: string
): Promise<{ index: WorkspaceNotebookIndexFile; entry: WorkspaceNotebookIndexEntry; notebook: WorkspaceNotebookFile }> {
  const now = new Date().toISOString();
  const legacySingleNotebookPath = path.join(getWorkspaceStorageDir(workspaceId), "notebook.json");
  const entry: WorkspaceNotebookIndexEntry = {
    id: "workspace-notebook",
    name: "Workspace Notebook",
    created_at: now,
    updated_at: now
  };

  try {
    const raw = await fs.readFile(legacySingleNotebookPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkspaceNotebookFile>;
    return {
      index: { version: 1, notebooks: [entry] },
      entry,
      notebook: {
        version: 1,
        cells: normalizeNotebookCells(parsed.cells)
      }
    };
  } catch (error) {
    if (!isFileNotFound(error)) {
      throw new WorkspaceNotebookStoreError(`Unable to migrate workspace notebook: ${getErrorMessage(error)}`, 500);
    }
  }

  return {
    index: { version: 1, notebooks: [entry] },
    entry,
    notebook: await createNotebookFromLegacyNotes(workspaceId)
  };
}

function normalizeNotebookCells(cells: unknown): NotebookCell[] {
  if (!Array.isArray(cells) || cells.length === 0) {
    return [
      {
        id: randomUUID(),
        type: "markdown",
        source: "# Notes",
        outputs: [],
        execution_status: "idle",
        updated_at: new Date().toISOString()
      }
    ];
  }

  return cells.map((cell) => {
    const record = isRecord(cell) ? cell : {};
    const type = normalizeCellType(String(record.type ?? "markdown"));
    return {
      id: String(record.id ?? randomUUID()),
      type,
      source: String(record.source ?? ""),
      outputs: normalizeOutputs(record.outputs),
      execution_status: normalizeExecutionStatus(String(record.execution_status ?? "idle")),
      updated_at: String(record.updated_at ?? new Date().toISOString())
    };
  });
}

function normalizeOutputs(outputs: unknown): NotebookCellOutput[] {
  if (!Array.isArray(outputs)) {
    return [];
  }

  return outputs.map((output) => {
    const record = isRecord(output) ? output : {};
    return {
      id: String(record.id ?? randomUUID()),
      kind: normalizeOutputKind(String(record.kind ?? "stream")),
      content: String(record.content ?? ""),
      created_at: String(record.created_at ?? new Date().toISOString())
    };
  });
}

function normalizeCellType(value: string): NotebookCellType {
  if (value === "python" || value === "prompt" || value === "markdown") {
    return value;
  }

  return "markdown";
}

function normalizeExecutionStatus(value: string): NotebookCellExecutionStatus {
  if (value === "running" || value === "completed" || value === "failed" || value === "idle") {
    return value;
  }

  return "idle";
}

function normalizeOutputKind(value: string): NotebookCellOutputKind {
  if (value === "stream" || value === "result" || value === "error" || value === "codex") {
    return value;
  }

  return "stream";
}

function buildPythonOutputs(response: PythonExecutionResponse): NotebookCellOutput[] {
  const outputs: NotebookCellOutput[] = [];
  const now = new Date().toISOString();

  if (response.stdout.trim()) {
    outputs.push({
      id: randomUUID(),
      kind: "stream",
      content: response.stdout.trimEnd(),
      created_at: now
    });
  }

  if (response.stderr.trim()) {
    outputs.push({
      id: randomUUID(),
      kind: "error",
      content: response.stderr.trimEnd(),
      created_at: now
    });
  }

  if (response.result?.trim()) {
    outputs.push({
      id: randomUUID(),
      kind: "result",
      content: response.result.trim(),
      created_at: now
    });
  }

  if (!response.ok) {
    outputs.push({
      id: randomUUID(),
      kind: "error",
      content: String(response.error ?? "Python execution failed").trim(),
      created_at: now
    });
  }

  return outputs;
}

function buildEmptyNotebookFile(): WorkspaceNotebookFile {
  return {
    version: 1,
    cells: [
      {
        id: randomUUID(),
        type: "markdown",
        source: "# Notes",
        outputs: [],
        execution_status: "idle",
        updated_at: new Date().toISOString()
      }
    ]
  };
}

async function runPythonInWorkspace(workspaceId: string, code: string) {
  const runtime = getOrCreatePythonRuntime(workspaceId);
  const requestId = randomUUID();

  const response = await new Promise<PythonExecutionResponse>((resolve, reject) => {
    runtime.pending.set(requestId, { resolve, reject });
    runtime.process.stdin.write(`${JSON.stringify({ id: requestId, code })}\n`, "utf8");
  });

  return response;
}

function getOrCreatePythonRuntime(workspaceId: string) {
  const existing = pythonRuntimes.get(workspaceId);
  if (existing) {
    return existing;
  }

  const child = spawn("python", ["-u", "-c", pythonRuntimeScript], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"]
  });
  const runtime: PythonRuntime = {
    process: child,
    buffer: "",
    pending: new Map()
  };

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    runtime.buffer += chunk;
    const lines = runtime.buffer.split(/\r?\n/);
    runtime.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const response = JSON.parse(trimmed) as PythonExecutionResponse;
        const pending = runtime.pending.get(response.id);
        if (pending) {
          runtime.pending.delete(response.id);
          pending.resolve(response);
        }
      } catch {
        // Ignore malformed chunks from the runtime process.
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    const message = String(chunk).trim();
    if (!message) {
      return;
    }

    for (const [requestId, pending] of runtime.pending.entries()) {
      runtime.pending.delete(requestId);
      pending.reject(new WorkspaceNotebookStoreError(message, 500));
    }
  });
  child.on("exit", () => {
    pythonRuntimes.delete(workspaceId);
    for (const [requestId, pending] of runtime.pending.entries()) {
      runtime.pending.delete(requestId);
      pending.reject(new WorkspaceNotebookStoreError("Python notebook runtime stopped unexpectedly", 500));
    }
  });

  pythonRuntimes.set(workspaceId, runtime);
  return runtime;
}

async function askCodexForNotebookCell(workspaceId: string, cells: NotebookCell[], prompt: string) {
  const outputPath = path.join(process.cwd(), ".tmp", `workspace-notebook-${process.pid}-${Date.now()}-${randomUUID()}.md`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const command = formatCodexCommand(process.env.CODEX_CHAT_COMMAND ?? defaultNotebookCodexCommand, outputPath);

  if (command.trim().toLowerCase() === "off") {
    throw new WorkspaceNotebookStoreError("Codex notebook prompts are disabled", 503);
  }

  const workspaceContext = await buildWorkspaceChatContext(workspaceId);
  const notebookContext = cells
    .map((cell, index) => {
      const outputs = cell.outputs.map((output) => `[${output.kind}] ${output.content}`).join("\n");
      return `Cell ${index + 1} (${cell.type})\n${cell.source}${outputs ? `\n\nOutputs:\n${outputs}` : ""}`;
    })
    .join("\n\n---\n\n");
  const fullPrompt = `You are Codex replying inline inside a workspace notebook.

Rules:
- Answer the user's prompt directly and concisely in Markdown.
- Treat the workspace and notebook cells as the full local context.
- Do not output CSV unless the prompt explicitly asks for a plan/table in CSV.
- Do not refer to hidden system behavior or tools.

Workspace context:
${JSON.stringify(workspaceContext, null, 2)}

Notebook context:
${notebookContext || "No notebook cells yet."}

Prompt cell:
${prompt}
`;

  const stdout = await runCommandWithStdin(command, fullPrompt);
  return (await readOptionalFile(outputPath)) || stdout;
}

function runCommandWithStdin(command: string, input: string) {
  const timeoutMs = Number(process.env.CODEX_CHAT_TIMEOUT_MS ?? 120_000);

  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      shell: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new WorkspaceNotebookStoreError(`Command timed out after ${timeoutMs}ms`, 500));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new WorkspaceNotebookStoreError(stderr.trim() || `Command exited with code ${code}`, 500));
      }
    });

    child.stdin.end(input);
  });
}

async function exportNotebookToLegacyMarkdown(workspaceId: string, cells: NotebookCell[]) {
  const content = cells
    .map((cell) => {
      if (cell.type === "markdown") {
        return cell.source.trim();
      }

      if (cell.type === "python") {
        const outputs = cell.outputs.map((output) => output.content.trim()).filter(Boolean).join("\n\n");
        return [`## Python Cell`, "", "```python", cell.source.trim(), "```", outputs ? `\nOutput:\n\`\`\`\n${outputs}\n\`\`\`` : ""]
          .filter(Boolean)
          .join("\n");
      }

      const response = cell.outputs.map((output) => output.content.trim()).filter(Boolean).join("\n\n");
      return [`## Prompt Cell`, "", cell.source.trim(), response ? `\nResponse:\n${response}` : ""].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  await fs.mkdir(path.dirname(getLegacyWorkspaceNotesPath(workspaceId)), { recursive: true });
  await fs.writeFile(getLegacyWorkspaceNotesPath(workspaceId), `${content.trim()}\n`, "utf8");
}

function getWorkspaceNotebookPath(workspaceId: string, notebookId: string) {
  return path.join(getWorkspaceStorageDir(workspaceId), "notebooks", `${safeId(notebookId)}.json`);
}

function getWorkspaceNotebookIndexPath(workspaceId: string) {
  return path.join(getWorkspaceStorageDir(workspaceId), "notebooks", "index.json");
}

function getLegacyWorkspaceNotesPath(workspaceId: string) {
  return path.join(getWorkspaceStorageDir(workspaceId), "notes.md");
}

function getWorkspaceStorageDir(workspaceId: string) {
  return path.join(getWorkspacesRootDir(), safeId(workspaceId));
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}

function findAvailableNotebookId(entries: WorkspaceNotebookIndexEntry[], preferredId: string) {
  let candidate = preferredId;
  let suffix = 2;

  while (entries.some((entry) => entry.id === candidate)) {
    candidate = `${preferredId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function isNotebookIndexEntry(value: unknown): value is WorkspaceNotebookIndexEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

function normalizeNotebookIndexEntry(entry: WorkspaceNotebookIndexEntry): WorkspaceNotebookIndexEntry {
  return {
    id: entry.id,
    name: entry.name,
    created_at: entry.created_at,
    updated_at: entry.updated_at
  };
}

async function readOptionalFile(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return "";
    }

    throw new WorkspaceNotebookStoreError(`Unable to read ${filePath}: ${getErrorMessage(error)}`, 500);
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

function formatCodexCommand(command: string, outputPath: string) {
  return command.replaceAll("{outputFile}", outputPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"'));
}

function isRetryableReplaceError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "EPERM" || error.code === "EACCES" || error.code === "EBUSY")
  );
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getWorkspacesRootDir() {
  return path.resolve(process.env.TRACKER_DATA_DIR ?? "./data", "workspaces");
}
