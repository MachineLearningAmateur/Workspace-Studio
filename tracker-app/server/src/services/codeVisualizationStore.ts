import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getChatSession } from "./chatStore.js";
import { getLearningSession } from "./learningSessionStore.js";
import { parseMarkdownCodeBlocks } from "./markdownCodeBlocks.js";

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

export class CodeVisualizationError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500
  ) {
    super(message);
  }
}

const defaultCodexVisualizationCommand =
  'codex exec --skip-git-repo-check --sandbox read-only --ephemeral --json --output-last-message "{outputFile}" -';

export async function createCodeVisualization(input: CodeVisualizationRequest): Promise<CodeVisualizationResponse> {
  validateRequest(input);
  const source = await getSourceMessage(input);
  const codeBlock = parseMarkdownCodeBlocks(source.message.content).find((block) => block.codeBlockIndex === input.codeBlockIndex);

  if (!codeBlock) {
    throw new CodeVisualizationError(`Code block not found for index ${input.codeBlockIndex}`, 404);
  }

  const normalizedLanguage = codeBlock.language.trim().toLowerCase();
  if (normalizedLanguage !== "py" && normalizedLanguage !== "python") {
    throw new CodeVisualizationError("Only python code blocks can be visualized right now", 400);
  }

  const outputPath = path.join(process.cwd(), ".tmp", `code-visualization-${process.pid}-${Date.now()}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const command = formatCodexCommand(
    process.env.CODEX_VISUALIZATION_COMMAND ?? defaultCodexVisualizationCommand,
    outputPath
  );

  if (command.trim().toLowerCase() === "off") {
    throw new CodeVisualizationError("Code visualization is disabled", 503);
  }

  const prompt = buildVisualizationPrompt(codeBlock.content, source.context);
  const output = await runCommandWithStdin(command, prompt);
  const finalOutput = (await readOutputFile(outputPath)) || output;
  const visualization = parseVisualizationResponse(finalOutput || output, codeBlock.content);
  return visualization;
}

async function getSourceMessage(input: CodeVisualizationRequest) {
  if (input.sourceType === "chat") {
    const session = await getChatSession(input.sessionId);
    const messageIndex = session.messages.findIndex((candidate) => candidate.id === input.messageId);

    if (messageIndex < 0) {
      throw new CodeVisualizationError(`Chat message not found: ${input.messageId}`, 404);
    }

    return {
      message: session.messages[messageIndex],
      context: buildSessionContext(session.messages, messageIndex)
    };
  }

  const session = await getLearningSession(input.sessionId);
  const message = session.messages.find((entry) => entry.id === input.messageId);
  const messageIndex = session.messages.findIndex((entry) => entry.id === input.messageId);

  if (!message) {
    throw new CodeVisualizationError(`Learning session message not found: ${input.messageId}`, 404);
  }

  return {
    message,
    context: buildSessionContext(session.messages, messageIndex)
  };
}

function buildVisualizationPrompt(code: string, context: string) {
  return `You are generating a code-execution teaching trace for a Python snippet.

Return exactly one fenced json block and nothing else.

Rules:
- Use the provided code exactly as written.
- Use the surrounding conversation to infer concrete values for otherwise-undefined names when the context clearly provides them.
- If you infer values from context, list each one in assumptions as a short string like "arr = [2, 5, 7] from earlier message".
- If the context does not define a simple input, choose a small representative example value and list it in assumptions with a note like "example value chosen for visualization".
- Prefer short, deterministic examples:
  - strings like "abc" or "aab"
  - small integer arrays like [1, 3, 5]
  - small integers like 2 or 3
  - booleans true or false
  - tiny dicts or sets only when the code clearly expects them
- Keep illustrative assumptions consistent across all steps.
- Explain the code as a sequence of concrete execution steps.
- Each step must correspond to one executed line.
- lineNumber must be 1-based and refer to the original snippet line number.
- variables must be a flat object whose values are short strings.
- Include only variables that are in scope and relevant at that step.
- Keep explanations short and concrete.
- Only return an error when the snippet depends on complex external behavior that cannot be represented with a simple illustrative assumption, such as custom classes, database handles, network clients, framework request objects, callbacks, or omitted helper functions whose behavior is essential.
- If you use illustrative assumptions because values were missing, say so briefly in summary.
- If the snippet is incomplete, non-runnable, or too ambiguous even after checking the context and trying simple illustrative assumptions, return:
{
  "error": "short reason",
  "missingBindings": ["name1", "name2"]
}

Required shape:
{
  "language": "python",
  "summary": "optional short summary",
  "assumptions": ["optional inferred binding"],
  "steps": [
    {
      "stepIndex": 0,
      "lineNumber": 1,
      "lineText": "source line",
      "variables": { "x": "1" },
      "explanation": "what changed",
      "output": "optional printed output"
    }
  ]
}

Code:
\`\`\`python
${code}
\`\`\`

Surrounding conversation context:
\`\`\`text
${context}
\`\`\`
`;
}

function parseVisualizationResponse(raw: string, code: string): CodeVisualizationResponse {
  const jsonBlock = raw.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? raw;
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(jsonBlock.trim()) as Record<string, unknown>;
  } catch (error) {
    throw new CodeVisualizationError(`Unable to parse visualization response: ${getErrorMessage(error)}`, 500);
  }

  if (typeof parsed.error === "string" && parsed.error.trim()) {
    const missingBindings = Array.isArray(parsed.missingBindings)
      ? parsed.missingBindings.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim())
      : [];
    const suffix = missingBindings.length ? ` Missing values: ${missingBindings.join(", ")}.` : "";
    throw new CodeVisualizationError(`${parsed.error.trim()}${suffix}`, 400);
  }

  const steps = Array.isArray(parsed.steps)
    ? parsed.steps.map((step, index) => normalizeStep(step, index))
    : [];

  if (steps.length === 0) {
    throw new CodeVisualizationError("Visualization did not contain any trace steps", 500);
  }

  return {
    language: "python",
    code,
    steps,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    assumptions: Array.isArray(parsed.assumptions)
      ? parsed.assumptions.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim())
      : []
  };
}

function normalizeStep(value: unknown, fallbackIndex: number): CodeVisualizationStep {
  const step = isRecord(value) ? value : {};
  return {
    stepIndex: Number.isInteger(step.stepIndex) ? Number(step.stepIndex) : fallbackIndex,
    lineNumber: Number.isInteger(step.lineNumber) ? Number(step.lineNumber) : 1,
    lineText: typeof step.lineText === "string" ? step.lineText : "",
    variables: normalizeVariables(step.variables),
    explanation: typeof step.explanation === "string" ? step.explanation : "",
    output: typeof step.output === "string" ? step.output : ""
  };
}

function normalizeVariables(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => typeof key === "string")
      .map(([key, entry]) => [key, typeof entry === "string" ? entry : JSON.stringify(entry)])
  );
}

function validateRequest(input: CodeVisualizationRequest) {
  if ((input.sourceType !== "chat" && input.sourceType !== "learning_session") || !input.sessionId || !input.messageId) {
    throw new CodeVisualizationError("sourceType, sessionId, and messageId are required", 400);
  }

  if (!Number.isInteger(input.codeBlockIndex) || input.codeBlockIndex < 0) {
    throw new CodeVisualizationError("codeBlockIndex must be a non-negative integer", 400);
  }
}

function buildSessionContext(messages: Array<{ role: string; content: string }>, focusIndex: number) {
  const startIndex = Math.max(0, focusIndex - 6);
  const endIndex = Math.min(messages.length - 1, focusIndex + 2);

  return messages
    .slice(startIndex, endIndex + 1)
    .map((message, relativeIndex) => {
      const absoluteIndex = startIndex + relativeIndex;
      const marker = absoluteIndex === focusIndex ? " [target message]" : "";
      return `${message.role}${marker}:\n${truncateContext(message.content)}`;
    })
    .join("\n\n---\n\n");
}

function truncateContext(content: string) {
  const trimmed = content.trim();
  if (trimmed.length <= 4_000) {
    return trimmed;
  }

  return `${trimmed.slice(0, 4_000).trimEnd()}\n...[truncated]`;
}

function runCommandWithStdin(command: string, input: string) {
  const timeoutMs = Number(process.env.CODEX_VISUALIZATION_TIMEOUT_MS ?? 120_000);

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

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
