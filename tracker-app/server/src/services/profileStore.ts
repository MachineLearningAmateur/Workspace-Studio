import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getPlanDataDir } from "./planStore.js";

export interface ProfileSnapshot {
  path: string;
  resume_filename: string;
  resume_content: string;
  background_notes: string;
  updated_at: string;
}

export class ProfileStoreError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

const maxProfileBytes = 1_500_000;
const defaultCodexProfileCommand =
  'codex exec --skip-git-repo-check --sandbox read-only --ephemeral --json --output-last-message "{outputFile}" -';

export function getProfilePath() {
  return path.join(getPlanDataDir(), "profile.json");
}

export async function getProfileSnapshot(): Promise<ProfileSnapshot> {
  try {
    const raw = await fs.readFile(getProfilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ProfileSnapshot>;

    return normalizeProfile(parsed);
  } catch (error) {
    if (isFileNotFound(error)) {
      return emptyProfile();
    }

    throw new ProfileStoreError(`Unable to read profile: ${getErrorMessage(error)}`, 500);
  }
}

export async function saveProfile(input: { resume_filename?: string; resume_content?: string; background_notes?: string }) {
  const resumeContent = String(input.resume_content ?? "");
  const backgroundNotes = String(input.background_notes ?? "");

  if (Buffer.byteLength(resumeContent, "utf8") + Buffer.byteLength(backgroundNotes, "utf8") > maxProfileBytes) {
    throw new ProfileStoreError("Profile content is too large", 400);
  }

  const snapshot: ProfileSnapshot = {
    path: getProfilePath(),
    resume_filename: sanitizeFilename(input.resume_filename ?? ""),
    resume_content: resumeContent.trim(),
    background_notes: backgroundNotes.trim(),
    updated_at: new Date().toISOString()
  };

  await writeProfile(snapshot);
  return snapshot;
}

export async function clearProfile() {
  const snapshot = emptyProfile();
  await writeProfile(snapshot);
  return snapshot;
}

export async function getProfileContext() {
  const profile = await getProfileSnapshot();
  const sections: string[] = [];

  if (profile.resume_content.trim()) {
    sections.push(`Resume${profile.resume_filename ? ` (${profile.resume_filename})` : ""}:\n${truncateForPrompt(profile.resume_content, 12_000)}`);
  }

  if (profile.background_notes.trim()) {
    sections.push(`Additional background notes:\n${truncateForPrompt(profile.background_notes, 4_000)}`);
  }

  return sections.length ? sections.join("\n\n---\n\n") : "No resume or user background profile saved.";
}

export async function generateBackgroundFromResume(input: { resume_filename?: string; resume_content?: string; existing_background_notes?: string }) {
  const resumeContent = String(input.resume_content ?? "").trim();

  if (!resumeContent) {
    throw new ProfileStoreError("Resume content is required", 400);
  }

  const outputPath = path.join(getPlanDataDir(), `profile-background-${Date.now()}.md`);
  const command = formatCodexCommand(process.env.CODEX_PROFILE_COMMAND ?? defaultCodexProfileCommand, outputPath);

  if (command.trim().toLowerCase() === "off") {
    return generateFallbackBackgroundNotes(resumeContent);
  }

  const prompt = buildBackgroundPrompt({
    resume_filename: input.resume_filename ?? "",
    resume_content: resumeContent,
    existing_background_notes: input.existing_background_notes ?? ""
  });
  const content = await runCommandWithStdin(command, prompt);
  return (await readOutputFile(outputPath)) || content;
}

async function writeProfile(snapshot: ProfileSnapshot) {
  await fs.mkdir(path.dirname(getProfilePath()), { recursive: true });
  const tempPath = `${getProfilePath()}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, getProfilePath());
}

function emptyProfile(): ProfileSnapshot {
  return {
    path: getProfilePath(),
    resume_filename: "",
    resume_content: "",
    background_notes: "",
    updated_at: ""
  };
}

function normalizeProfile(profile: Partial<ProfileSnapshot>): ProfileSnapshot {
  return {
    path: getProfilePath(),
    resume_filename: String(profile.resume_filename ?? ""),
    resume_content: String(profile.resume_content ?? ""),
    background_notes: String(profile.background_notes ?? ""),
    updated_at: String(profile.updated_at ?? "")
  };
}

function sanitizeFilename(filename: string) {
  return path.basename(String(filename || "")).replace(/[^a-zA-Z0-9._ -]/g, "_").trim();
}

function truncateForPrompt(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}\n[truncated]`;
}

function buildBackgroundPrompt(input: { resume_filename: string; resume_content: string; existing_background_notes: string }) {
  return `You are Codex helping maintain an interview-prep profile.

Use only the resume/background text included here. Do not run shell commands, inspect files, or call APIs.

Create concise Markdown background notes that will help with STAR behavioral prep and personalized interview guidance.

Include these sections:
- Professional Summary
- Core Strengths
- Project / Experience Themes
- STAR Story Seeds
- Behavioral Talking Points
- Gaps or Follow-up Questions

For STAR Story Seeds, include 4-8 bullets. Each bullet should name the likely story, situation, task, action hints, result evidence to look for, and behavioral themes like ownership, conflict, ambiguity, leadership, failure, impact, collaboration, or learning quickly.

Resume filename: ${input.resume_filename || "resume"}

Resume:
${truncateForPrompt(input.resume_content, 18_000)}

Existing background notes to preserve if useful:
${input.existing_background_notes.trim() || "None"}
`;
}

function generateFallbackBackgroundNotes(resumeContent: string) {
  const lines = resumeContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 24);

  return `## Professional Summary
- Review the resume and refine this profile with your strongest target-role positioning.

## Core Strengths
- Extracted from resume text. Edit these after reviewing the bullets below.

## Project / Experience Themes
${lines.slice(0, 8).map((line) => `- ${line}`).join("\n") || "- Add project and experience themes."}

## STAR Story Seeds
- Ownership: choose a project where you drove a result end to end.
- Ambiguity: choose a project with unclear requirements or a new domain.
- Collaboration: choose a project involving cross-functional work or stakeholder feedback.
- Failure or learning: choose a bug, incident, or difficult technical gap and explain what changed afterward.

## Behavioral Talking Points
- Tie examples to measurable impact, tradeoffs, and what you personally did.

## Gaps or Follow-up Questions
- Add metrics, constraints, team size, production impact, and conflict/tradeoff details where missing.`;
}

function runCommandWithStdin(command: string, input: string) {
  const timeoutMs = Number(process.env.CODEX_PROFILE_TIMEOUT_MS ?? 120_000);

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
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
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
        reject(new Error(stderr.trim() || `Command exited with code ${code}`));
      }
    });

    child.stdin.end(input);
  });
}

async function readOutputFile(outputPath: string) {
  try {
    return await fs.readFile(outputPath, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return "";
    }

    throw error;
  }
}

function formatCodexCommand(command: string, outputPath: string) {
  return command.replaceAll("{outputFile}", outputPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"'));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
