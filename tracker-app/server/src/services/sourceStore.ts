import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getPlanDataDir } from "./planStore.js";

export interface MarkdownSource {
  id: string;
  filename: string;
  stored_path: string;
  created_at: string;
  updated_at: string;
  byte_length: number;
}

interface SourceRegistry {
  sources: MarkdownSource[];
}

export class SourceStoreError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

const maxMarkdownBytes = 1_500_000;

export function getSourceRegistryPath() {
  return path.join(getPlanDataDir(), "sources.json");
}

export function getSourcesDir() {
  return path.join(getPlanDataDir(), "sources");
}

export async function listSources() {
  const registry = await readRegistry();
  return registry.sources;
}

export async function getSourcesByIds(sourceIds: string[]) {
  const registry = await readRegistry();
  const requestedIds = new Set(sourceIds);
  const sources = registry.sources.filter((source) => requestedIds.has(source.id));

  if (sources.length !== requestedIds.size) {
    const foundIds = new Set(sources.map((source) => source.id));
    const missingIds = sourceIds.filter((sourceId) => !foundIds.has(sourceId));
    throw new SourceStoreError(`Source not found: ${missingIds.join(", ")}`, 404);
  }

  return Promise.all(
    sources.map(async (source) => ({
      source,
      content: await fs.readFile(source.stored_path, "utf8")
    }))
  );
}

export async function createSource(input: { filename: string; content: string }) {
  const filename = sanitizeFilename(input.filename);
  const content = String(input.content ?? "");
  const byteLength = Buffer.byteLength(content, "utf8");

  if (!filename.toLowerCase().endsWith(".md")) {
    throw new SourceStoreError(`Only markdown files are supported: ${filename}`, 400);
  }

  if (!content.trim()) {
    throw new SourceStoreError(`Markdown file is empty: ${filename}`, 400);
  }

  if (byteLength > maxMarkdownBytes) {
    throw new SourceStoreError(`Markdown file is too large: ${filename}`, 400);
  }

  const registry = await readRegistry();
  const id = uniqueSourceId(filename, registry.sources);
  const now = new Date().toISOString();
  const storedPath = path.join(getSourcesDir(), `${id}.md`);
  const source: MarkdownSource = {
    id,
    filename,
    stored_path: storedPath,
    created_at: now,
    updated_at: now,
    byte_length: byteLength
  };

  await fs.mkdir(getSourcesDir(), { recursive: true });
  await fs.writeFile(storedPath, content, "utf8");
  registry.sources.push(source);
  await writeRegistry(registry);
  return source;
}

export async function deleteSource(sourceId: string) {
  const registry = await readRegistry();
  const source = registry.sources.find((candidate) => candidate.id === sourceId);

  if (!source) {
    throw new SourceStoreError(`Source not found: ${sourceId}`, 404);
  }

  await writeRegistry({ sources: registry.sources.filter((candidate) => candidate.id !== sourceId) });
  await fs.rm(source.stored_path, { force: true });
  return source;
}

async function readRegistry(): Promise<SourceRegistry> {
  try {
    const raw = await fs.readFile(getSourceRegistryPath(), "utf8");
    const registry = JSON.parse(raw) as SourceRegistry;

    if (!Array.isArray(registry.sources)) {
      throw new Error("sources must be an array");
    }

    return registry;
  } catch (error) {
    if (isFileNotFound(error)) {
      const registry = { sources: [] };
      await writeRegistry(registry);
      return registry;
    }

    throw error;
  }
}

async function writeRegistry(registry: SourceRegistry) {
  await fs.mkdir(path.dirname(getSourceRegistryPath()), { recursive: true });
  await fs.writeFile(getSourceRegistryPath(), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

function uniqueSourceId(filename: string, sources: MarkdownSource[]) {
  const base = slugify(filename.replace(/\.md$/i, "")) || "source";
  const existingIds = new Set(sources.map((source) => source.id));
  let candidate = base;
  let suffix = 2;

  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function sanitizeFilename(filename: string) {
  const sanitized = path.basename(String(filename || "source.md")).replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized || "source.md";
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
