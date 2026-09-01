#!/usr/bin/env node

/**
 * MCP server wrapping local Ollama models for Claude Code delegation.
 *
 * Opus stays as the orchestrator - this server lets it offload bulk
 * generation work (summarisation, extraction, drafting, classification)
 * to a local model running on the user's hardware.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RAW_OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";

// Loopback gate: by default we refuse to talk to a non-loopback Ollama, so a
// caller-controlled OLLAMA_HOST cannot be used to exfiltrate prompts to a
// remote registry. Operators with a legitimate remote-Ollama deployment must
// opt in explicitly via MCP_OLLAMA_ALLOW_REMOTE=1.
{
  const parsed = new URL(RAW_OLLAMA_HOST);
  const host = parsed.hostname;
  const isLoopback =
    host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLoopback && process.env.MCP_OLLAMA_ALLOW_REMOTE !== "1") {
    throw new Error(
      `OLLAMA_HOST must be loopback (got ${host}); set MCP_OLLAMA_ALLOW_REMOTE=1 to override`
    );
  }
}

const OLLAMA_HOST = RAW_OLLAMA_HOST;
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "hermes3:8b";

// Model name validation regex - guards against caller-controlled values
// reaching the Ollama registry pull endpoint. Matches Ollama's published
// naming conventions (lowercase + dot/underscore/slash/hyphen, leading
// alnum, max 128 chars).
const MODEL_NAME_RE = /^[a-z0-9][a-z0-9._/-]{0,127}$/;

// ---------------------------------------------------------------------------
// Ollama HTTP client
// ---------------------------------------------------------------------------

interface OllamaGenerateResponse {
  response: string;
  model: string;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
}

interface OllamaVisionResponse {
  response: string;
  model: string;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

// ---------------------------------------------------------------------------
// token_burn substrate emission
// ---------------------------------------------------------------------------
// Every local generation runs on your own hardware at no API cost, and this
// server keeps a local tally of it in
// ~/.local/share/alter-runtime/token-burn.jsonl. The write goes through a
// helper script the alter runtime installs, rather than being reimplemented
// here, so there is one writer and one format.
//
// The write is best-effort and fire-and-forget. If bash, jq or the helper is
// missing, or the helper declines, it degrades to a silent no-op and never
// affects the tool result. Nothing about it leaves your machine. The session
// id is minted once per server process and is local to it.
const SESSION_ID = randomUUID();
const SUBSTRATE_EMIT_LIB = pathResolve(
  homedir(),
  ".local/share/alter-runtime/lib/substrate-emit.sh"
);

function emitTokenBurn(
  tool: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): void {
  try {
    if (!existsSync(SUBSTRATE_EMIT_LIB)) return; // helper not installed -> no-op
    // Values are passed as positional arguments rather than interpolated into
    // the script text, so nothing a caller supplies is ever parsed as shell.
    // The helper owns the field order and the file format; this call site only
    // supplies the values it holds.
    const script =
      `. "$SUBSTRATE_EMIT_LIB" 2>/dev/null && ` +
      `substrate_emit_token_burn "$1" "$2" "" "$3" "$4" 0 0 "$5" 0 active_composition 2>/dev/null || true`;
    const child = spawn(
      "bash",
      [
        "-c",
        script,
        "bash",
        tool,
        SESSION_ID,
        model,
        String(Math.max(0, Math.trunc(inputTokens) || 0)),
        String(Math.max(0, Math.trunc(outputTokens) || 0)),
      ],
      {
        env: { ...process.env, SUBSTRATE_EMIT_LIB },
        stdio: "ignore",
        detached: false,
      }
    );
    child.on("error", () => {
      /* no-op: emission must never break the tool call */
    });
    child.unref();
  } catch {
    /* no-op */
  }
}

async function ollamaGenerate(
  model: string,
  system: string,
  prompt: string,
  temperature: number = 0.3,
  maxTokens: number = 2048
): Promise<OllamaGenerateResponse> {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      system,
      prompt,
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as OllamaGenerateResponse;
  emitTokenBurn(
    "ollama",
    data.model ?? model,
    data.prompt_eval_count ?? 0,
    data.eval_count ?? 0
  );
  return data;
}

// -- Vision generation (raw /api/generate with images[]) --------------------
// local_analyze / ollamaGenerate are TEXT-ONLY (no image field). A vision model
// (qwen2.5vl:7b) needs the raw multimodal path: images[] carries base64 PNGs.
// so a caller can have a local vision model look at a rendered image through
// the same MCP surface the text verbs use.
async function ollamaVision(
  model: string,
  prompt: string,
  imagesBase64: string[],
  temperature: number = 0.1,
  numCtx: number = 8192,
  keepAlive: string = "30m"
): Promise<OllamaVisionResponse> {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      images: imagesBase64,
      stream: false,
      keep_alive: keepAlive,
      options: {
        temperature,
        // Cap num_ctx so the model + one image stays fully GPU-resident;
        // 32K balloons VRAM (~23GB) and spills to CPU (measured, RX 7900).
        num_ctx: numCtx,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama vision error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as OllamaVisionResponse;
  emitTokenBurn(
    "ollama",
    data.model ?? model,
    data.prompt_eval_count ?? 0,
    data.eval_count ?? 0
  );
  return data;
}

async function ollamaList(): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_HOST}/api/tags`);
  if (!res.ok) throw new Error(`Ollama list failed: ${res.status}`);
  const data = (await res.json()) as { models: OllamaModel[] };
  return data.models;
}

async function ollamaPull(model: string): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, stream: false }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama pull failed ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { status: string };
  return data.status;
}

function formatDuration(ns?: number): string {
  if (!ns) return "unknown";
  const ms = ns / 1_000_000;
  return ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "mcp-ollama",
  version: "0.2.0",
});

// -- local_generate ---------------------------------------------------------
// General-purpose text generation. Use this for any task that doesn't need
// Opus-level reasoning: summaries, explanations, boilerplate, drafts, etc.

server.tool(
  "local_generate",
  `General-purpose local LLM generation. Delegates work to a local Ollama model
to save tokens. Use this when the task is bulk text processing that doesn't
require Opus-level reasoning: summarising documents, explaining code for docs,
generating boilerplate, reformatting content, translating, etc.

The local model (default: hermes3:8b) runs on the user's hardware - zero
API cost, ~40 tok/s on a decent GPU.`,
  {
    prompt: z.string().describe("The prompt / task for the local model"),
    system: z
      .string()
      .optional()
      .describe("System prompt to set context/role (optional)"),
    model: z
      .string()
      .optional()
      .describe(`Ollama model to use (default: ${DEFAULT_MODEL})`),
    temperature: z
      .number()
      .min(0)
      .max(2)
      .optional()
      .describe("Sampling temperature 0-2 (default: 0.3)"),
    max_tokens: z
      .number()
      .optional()
      .describe("Max tokens to generate (default: 2048)"),
  },
  async ({ prompt, system, model, temperature, max_tokens }) => {
    const result = await ollamaGenerate(
      model ?? DEFAULT_MODEL,
      system ?? "You are a helpful assistant. Be concise and direct.",
      prompt,
      temperature ?? 0.3,
      max_tokens ?? 2048
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `${result.response}\n\n---\n_Model: ${result.model} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
        },
      ],
    };
  }
);

// -- local_summarize --------------------------------------------------------

server.tool(
  "local_summarize",
  `Summarise long text locally. Use this instead of having Opus process large
blocks of text when you only need a summary. Feed in file contents, docs,
logs, or any bulk text and get a concise summary back.

Particularly valuable for: large file contents, documentation, log output,
meeting notes, long git diffs, error traces.`,
  {
    content: z.string().describe("The text to summarise"),
    focus: z
      .string()
      .optional()
      .describe(
        "What to focus on in the summary (e.g., 'security issues', 'API changes', 'key decisions')"
      ),
    format: z
      .enum(["paragraph", "bullets", "oneliner"])
      .optional()
      .describe("Output format (default: bullets)"),
    model: z
      .string()
      .optional()
      .describe(`Ollama model to use (default: ${DEFAULT_MODEL})`),
    max_tokens: z
      .number()
      .optional()
      .describe("Max tokens to generate (default: 1024)"),
  },
  async ({ content, focus, format, model, max_tokens }) => {
    const fmt = format ?? "bullets";
    const focusInstruction = focus ? `Focus specifically on: ${focus}.` : "";

    const system = `You are a precise summarisation assistant. Produce clear, accurate summaries. Never fabricate information not present in the source text. Use Australian English.`;

    const prompt = `Summarise the following text in ${fmt} format. ${focusInstruction}

---
${content}
---

Summary:`;

    const result = await ollamaGenerate(
      model ?? DEFAULT_MODEL,
      system,
      prompt,
      0.2,
      max_tokens ?? 1024
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `${result.response}\n\n---\n_Model: ${result.model} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
        },
      ],
    };
  }
);

// -- local_analyze ----------------------------------------------------------

server.tool(
  "local_analyze",
  `Extract structured information from text locally. Use this for classification,
entity extraction, tagging, pattern recognition, or any task that transforms
unstructured text into structured output.

Good for: categorising issues, extracting names/dates/amounts, tagging content,
parsing semi-structured data, sentiment analysis.`,
  {
    content: z.string().describe("The text to analyse"),
    task: z
      .string()
      .describe(
        "What to extract or analyse (e.g., 'extract all API endpoints mentioned', 'classify the sentiment', 'list all named entities')"
      ),
    output_format: z
      .string()
      .optional()
      .describe(
        "Desired output structure (e.g., 'JSON array', 'markdown table', 'key: value pairs')"
      ),
    model: z
      .string()
      .optional()
      .describe(`Ollama model to use (default: ${DEFAULT_MODEL})`),
  },
  async ({ content, task, output_format, model }) => {
    const formatInstruction = output_format
      ? `Output the results as: ${output_format}.`
      : "Output the results in the clearest structured format.";

    const system = `You are a precise information extraction assistant. Extract exactly what is asked for - nothing more. Be accurate and complete. ${formatInstruction}`;

    const prompt = `Task: ${task}

Text to analyse:
---
${content}
---

Results:`;

    const result = await ollamaGenerate(
      model ?? DEFAULT_MODEL,
      system,
      prompt,
      0.1,
      2048
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `${result.response}\n\n---\n_Model: ${result.model} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
        },
      ],
    };
  }
);

// -- local_draft ------------------------------------------------------------

server.tool(
  "local_draft",
  `Draft text locally - commit messages, PR descriptions, docstrings, changelog
entries, documentation sections, or any formulaic text that follows a template
or convention. Saves Opus tokens on boilerplate generation.`,
  {
    task: z
      .string()
      .describe(
        "What to draft (e.g., 'commit message for these changes', 'docstring for this function')"
      ),
    context: z
      .string()
      .describe(
        "The context/input the draft should be based on (e.g., diff output, function code, change description)"
      ),
    style: z
      .string()
      .optional()
      .describe(
        "Style guide or conventions to follow (e.g., 'imperative mood, max 72 chars subject line')"
      ),
    model: z
      .string()
      .optional()
      .describe(`Ollama model to use (default: ${DEFAULT_MODEL})`),
  },
  async ({ task, context, style, model }) => {
    const styleInstruction = style
      ? `Follow these conventions: ${style}.`
      : "";

    const system = `You are a technical writing assistant. Write clear, concise, professional text. ${styleInstruction} Use Australian English for prose, US English for code identifiers.`;

    const prompt = `Draft the following: ${task}

Context:
---
${context}
---

Draft:`;

    const result = await ollamaGenerate(
      model ?? DEFAULT_MODEL,
      system,
      prompt,
      0.4,
      1024
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `${result.response}\n\n---\n_Model: ${result.model} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
        },
      ],
    };
  }
);

// -- local_code -------------------------------------------------------------
// Code-aware generation: Claude reads code via Read/Grep, passes it here
// for the actual text generation (docstrings, tests, explanations, reviews).

server.tool(
  "local_code",
  `Code-aware local generation. Claude reads source code with Read/Grep (free),
then delegates the TEXT GENERATION to local - docstrings, test stubs,
explanations, type annotations, inline comments, or review feedback.

This is the primary tool for reducing API token usage on code tasks.
Claude orchestrates (decides what code to read, what task to perform),
but the actual generation happens locally at zero API cost.

Accepts up to ~12K tokens of code context (16K model context minus overhead).
For larger contexts, break into focused chunks (one function, one class).`,
  {
    code: z
      .string()
      .describe(
        "Source code to work with - a function, class, module, or diff"
      ),
    task: z
      .enum([
        "docstring",
        "test",
        "explain",
        "review",
        "types",
        "comments",
        "refactor-suggest",
      ])
      .describe(
        "What to generate: docstring (generate docstring), test (generate test stub), explain (explain the code), review (style/pattern review - NOT security), types (add type annotations), comments (add inline comments), refactor-suggest (suggest improvements)"
      ),
    language: z
      .string()
      .describe("Programming language (e.g., 'python', 'typescript')"),
    context: z
      .string()
      .optional()
      .describe(
        "Additional context: file path, project conventions, what the function is used for, etc."
      ),
    model: z
      .string()
      .optional()
      .describe(`Ollama model to use (default: ${DEFAULT_MODEL})`),
  },
  async ({ code, task, language, context, model }) => {
    const contextNote = context ? `\nAdditional context: ${context}` : "";

    const taskPrompts: Record<string, { system: string; instruction: string }> =
      {
        docstring: {
          system: `You are a documentation expert. Write clear, concise docstrings following ${language} conventions. Use Australian English for prose, US English for identifiers. Include parameter types, return types, and a brief description. Do NOT include the original code - only output the docstring.`,
          instruction: `Write a docstring for the following ${language} code.${contextNote}`,
        },
        test: {
          system: `You are a test engineer. Generate test stubs with clear test names and arrange/act/assert structure. Use pytest for Python, Jest for TypeScript/JavaScript. Include edge cases. Output ONLY the test code.`,
          instruction: `Generate test stubs for the following ${language} code. Cover the main path and key edge cases.${contextNote}`,
        },
        explain: {
          system: `You are a senior developer explaining code to a colleague. Be concise - explain WHAT it does and WHY, not line-by-line. Use Australian English. Mention non-obvious design choices or gotchas.`,
          instruction: `Explain the following ${language} code.${contextNote}`,
        },
        review: {
          system: `You are a code reviewer focused on style, patterns, naming, readability, and correctness. Do NOT review for security (that stays on Opus). Flag issues as: [STYLE], [NAMING], [BUG], [PATTERN], [READABILITY]. Be specific - cite the line or construct.`,
          instruction: `Review the following ${language} code for style, patterns, and correctness.${contextNote}`,
        },
        types: {
          system: `You are a typing expert. Add type annotations to the code following ${language} best practices (PEP 484 for Python, strict TypeScript). Output the full code with types added. Do NOT change logic.`,
          instruction: `Add type annotations to the following ${language} code.${contextNote}`,
        },
        comments: {
          system: `You are adding inline comments to code. Only comment non-obvious logic - do NOT comment self-evident code. Comments should explain WHY, not WHAT. Use Australian English.`,
          instruction: `Add inline comments to non-obvious parts of the following ${language} code.${contextNote}`,
        },
        "refactor-suggest": {
          system: `You are a senior developer suggesting refactoring improvements. Focus on: reducing complexity, improving naming, extracting helpers where justified (not premature abstraction), removing duplication. Do NOT suggest changes for their own sake - only flag genuine improvements. Output a numbered list of suggestions with brief rationale.`,
          instruction: `Suggest refactoring improvements for the following ${language} code.${contextNote}`,
        },
      };

    const { system, instruction } = taskPrompts[task];

    const prompt = `${instruction}

\`\`\`${language}
${code}
\`\`\``;

    const result = await ollamaGenerate(
      model ?? DEFAULT_MODEL,
      system,
      prompt,
      task === "test" || task === "types" ? 0.2 : 0.3,
      4096
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `${result.response}\n\n---\n_Model: ${result.model} | Task: ${task} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
        },
      ],
    };
  }
);

// -- local_diff -------------------------------------------------------------
// Summarise or analyse diffs locally - saves API tokens on PR descriptions,
// changelog entries, and commit messages from large diffs.

server.tool(
  "local_diff",
  `Analyse a git diff locally. Use this for generating commit messages,
PR descriptions, changelog entries, or understanding what changed in a diff.
Claude runs \`git diff\` (free), passes the output here for text generation.

Particularly valuable for large diffs that would consume many API tokens
if processed by Opus/Sonnet directly.`,
  {
    diff: z.string().describe("The git diff output"),
    task: z
      .enum(["commit-message", "pr-description", "changelog", "summary", "impact"])
      .describe(
        "What to generate: commit-message, pr-description, changelog (categorised entries), summary (what changed), impact (what might break)"
      ),
    style: z
      .string()
      .optional()
      .describe(
        "Style conventions (e.g., 'imperative mood, 72 char subject')"
      ),
    model: z
      .string()
      .optional()
      .describe(`Ollama model to use (default: ${DEFAULT_MODEL})`),
  },
  async ({ diff, task, style, model }) => {
    const styleNote = style ? `\nFollow these conventions: ${style}` : "";

    const taskPrompts: Record<string, { system: string; instruction: string }> =
      {
        "commit-message": {
          system: `You are writing a git commit message. Use imperative mood for the subject line (max 72 chars). Add a body with bullet points if the diff is non-trivial. Focus on WHY, not WHAT. Use Australian English for prose.${styleNote}`,
          instruction:
            "Write a commit message for the following diff.",
        },
        "pr-description": {
          system: `You are writing a pull request description. Structure: ## Summary (2-3 bullet points), ## Changes (categorised list), ## Test plan (what to verify). Be concise. Use Australian English.${styleNote}`,
          instruction:
            "Write a PR description for the following diff.",
        },
        changelog: {
          system: `You are writing changelog entries. Categorise as: Added, Changed, Fixed, Removed, Security, Infrastructure. Each entry should describe what changed from the user's perspective - not file names. Use Australian English.${styleNote}`,
          instruction:
            "Write categorised changelog entries for the following diff.",
        },
        summary: {
          system: `You are summarising code changes. Be concise - what changed and why. Group related changes. Use Australian English.${styleNote}`,
          instruction: "Summarise the following diff.",
        },
        impact: {
          system: `You are analysing the potential impact of code changes. List: what might break, what needs testing, what external systems are affected. Be specific - cite file paths and function names from the diff.${styleNote}`,
          instruction:
            "Analyse the potential impact of the following diff. What might break?",
        },
      };

    const { system, instruction } = taskPrompts[task];
    const prompt = `${instruction}\n\n\`\`\`diff\n${diff}\n\`\`\``;

    const result = await ollamaGenerate(
      model ?? DEFAULT_MODEL,
      system,
      prompt,
      0.3,
      task === "commit-message" ? 512 : 2048
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `${result.response}\n\n---\n_Model: ${result.model} | Task: ${task} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
        },
      ],
    };
  }
);

// -- local_transform --------------------------------------------------------
// Mechanical code transformations that don't need reasoning.

server.tool(
  "local_transform",
  `Perform mechanical code transformations locally. These are pattern-based
transforms that don't require architectural understanding - the kind of
work that burns API tokens for no good reason.

Use this for: converting between formats, renaming patterns, migrating
syntax, generating boilerplate from examples, etc.`,
  {
    input: z.string().describe("The input code or text to transform"),
    transform: z
      .string()
      .describe(
        "What transformation to apply (e.g., 'convert class component to functional React component', 'convert these SQL queries to SQLAlchemy ORM', 'rename all instances of oldName to newName and update references', 'convert this JSON schema to Pydantic models')"
      ),
    language: z
      .string()
      .optional()
      .describe("Target programming language"),
    model: z
      .string()
      .optional()
      .describe(`Ollama model to use (default: ${DEFAULT_MODEL})`),
  },
  async ({ input, transform, language, model }) => {
    const langNote = language ? ` Output in ${language}.` : "";

    const system = `You are a code transformation tool. Apply the requested transformation precisely. Output ONLY the transformed code - no explanations, no markdown fences unless the input had them. Preserve formatting and style conventions.${langNote}`;

    const prompt = `Transformation: ${transform}

Input:
${input}

Output:`;

    const result = await ollamaGenerate(
      model ?? DEFAULT_MODEL,
      system,
      prompt,
      0.1,
      4096
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `${result.response}\n\n---\n_Model: ${result.model} | Transform | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
        },
      ],
    };
  }
);

// -- local_models -----------------------------------------------------------

server.tool(
  "local_models",
  `List all models available in the local Ollama instance. Use this to check
what models are loaded and available for delegation.`,
  {},
  async () => {
    const models = await ollamaList();

    const lines = models.map((m) => {
      const sizeGB = (m.size / 1_073_741_824).toFixed(1);
      const params = m.details?.parameter_size ?? "?";
      const quant = m.details?.quantization_level ?? "?";
      const family = m.details?.family ?? "?";
      return `- **${m.name}** - ${sizeGB} GB, ${params} params, ${quant} quantisation, family: ${family}`;
    });

    return {
      content: [
        {
          type: "text" as const,
          text:
            lines.length > 0
              ? `Available Ollama models:\n\n${lines.join("\n")}`
              : "No models currently loaded in Ollama.",
        },
      ],
    };
  }
);

// -- local_pull -------------------------------------------------------------

server.tool(
  "local_pull",
  `Pull/download a model into Ollama from the registry, or import a local GGUF
file. Use this to make additional models available for delegation.

For GGUF files, create an Ollama Modelfile first, then use 'ollama create'.
This tool handles registry pulls (e.g., 'qwen2.5:14b', 'deepseek-r1:8b').`,
  {
    model: z
      .string()
      .describe(
        "Model to pull (e.g., 'qwen2.5:14b', 'mistral-nemo', 'deepseek-r1:8b')"
      ),
  },
  async ({ model }) => {
    if (!MODEL_NAME_RE.test(model)) {
      throw new Error(
        `Invalid model name: must match ${MODEL_NAME_RE.source}`
      );
    }
    const status = await ollamaPull(model);
    return {
      content: [
        {
          type: "text" as const,
          text: `Pull complete: ${model} - ${status}`,
        },
      ],
    };
  }
);

// -- local_vision -----------------------------------------------------------
// The vision SEE primitive as an MCP verb. local_analyze is text-only; this
// reaches the multimodal /api/generate path so a caller can have a local VLM
// SEE a rendered surface. It REPORTS what is on screen (populated versus
// degraded, legibility, structure) and never ranks severity or greenlights a
// change, because a local vision model reads pixels well and judges badly.

const DEFAULT_VISION_MODEL =
  process.env.OLLAMA_VISION_MODEL ?? "qwen2.5vl:7b";

// Reporting rubrics. Deliberately a REPORTING task, not a judgment task: the
// local vision model reads pixels reliably but ranks severity and domain
// badly, so we ask it only for what it can do.
const VISION_RUBRICS: Record<string, string> = {
  see:
    "You are a UI observer. Report ONLY what is literally visible. Do not praise, do not " +
    "rank importance, do not suggest changes.\n" +
    "Answer these, each on its own line:\n" +
    "A. MAIN CONTENT: is the primary content area populated with real, specific data, or " +
    "is it blank / empty / placeholder / showing an error or loading state? Quote the " +
    "actual text you see in that area as evidence.\n" +
    "B. STRUCTURE: list the major regions you can see (nav, header, main, cards, tables) " +
    "and whether each has real content or is empty.\n" +
    "C. LEGIBILITY: any text that is unreadable, clipped, overlapping, or too low-contrast " +
    "to read? Name it or say 'none observed'.\n" +
    "D. DOMINANT VISUAL STATE: in one sentence, what would a first-time viewer's eye land " +
    "on first, and is that a real feature or a broken/empty state?",
  legibility:
    "You are a UI observer. Report ONLY what is literally visible. For every text element " +
    "you can see, state whether it is fully readable. Flag anything clipped, overlapping, " +
    "truncated, low-contrast, or cut off at an edge. Quote the affected text. End with a " +
    "one-line verdict: READABLE or HAS-LEGIBILITY-FAULTS.",
  emptystate:
    "You are a UI observer checking DATA, not layout. Ignore section headings, nav, and " +
    "button labels: those being present does NOT mean the page has data.\n" +
    "Look ONLY at the actual DATA VALUES: the numbers/metrics in any stat row or KPI tiles, " +
    "and the body of each card.\n" +
    "For EACH metric or stat you can see, quote its VALUE. A value is REAL only if it is a " +
    "concrete number, name, or status. Treat any of these as NOT-REAL/degraded: blank, a " +
    "dash, 'cannot see', 'unknown', '[UNKNOWN]', 'obs ?', '--', 'N/A', 'error', 'loading', " +
    "a spinner, or placeholder text.\n" +
    "End with ONE line: DATA-PRESENT (most values real) or DATA-DEGRADED (most values " +
    "missing/unknown/error), and quote the degraded text you saw.",
};

server.tool(
  "local_vision",
  `Have a local vision model SEE a rendered image (screenshot of a UI) and report
what is literally on screen - for zero API cost. local_analyze is TEXT-ONLY;
this is the multimodal path.

It REPORTS (is the main content populated or blank/error, what regions exist,
any illegible/clipped text, what the eye lands on first). It does NOT rank
severity, judge on-brand, or greenlight a change - a local vision model reads
pixels well but ranks badly, so keep the judgment on the calling model.

Modes: 'see' (full structural report), 'emptystate' (populated-vs-degraded data
check), 'legibility' (readability faults). Feed near-full-resolution PNGs;
downscaling below ~1280px wide makes the model hallucinate data presence.`,
  {
    images: z
      .array(z.string())
      .min(1)
      .describe(
        "Absolute path(s) to rendered PNG/JPG screenshot file(s) to look at"
      ),
    mode: z
      .enum(["see", "emptystate", "legibility"])
      .optional()
      .describe("Reporting rubric (default: see)"),
    context: z
      .string()
      .optional()
      .describe("One line: what this surface is meant to be"),
    model: z
      .string()
      .optional()
      .describe(`Vision model to use (default: ${DEFAULT_VISION_MODEL})`),
  },
  async ({ images, mode, context, model }) => {
    const chosen = model ?? DEFAULT_VISION_MODEL;
    // Ollama tags use a colon separator (e.g. qwen2.5vl:7b), which the pull-time
    // MODEL_NAME_RE omits; permit the colon here while keeping the same
    // anti-injection shape (lowercase alnum + . _ / - : only).
    const VISION_MODEL_RE = /^[a-z0-9][a-z0-9._/:-]{0,127}$/;
    if (!VISION_MODEL_RE.test(chosen)) {
      throw new Error(
        `Invalid model name: must match ${VISION_MODEL_RE.source}`
      );
    }
    let encoded: string[];
    try {
      encoded = images.map((p) => readFileSync(p).toString("base64"));
    } catch (e) {
      throw new Error(
        `Cannot read image: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    const rubric = VISION_RUBRICS[mode ?? "see"] ?? VISION_RUBRICS.see;
    const prompt = context
      ? `CONTEXT (what this surface is meant to be): ${context}\n\n${rubric}`
      : rubric;

    const result = await ollamaVision(chosen, prompt, encoded);

    return {
      content: [
        {
          type: "text" as const,
          text: `${result.response}\n\n---\n_Model: ${result.model} | Vision (${mode ?? "see"}) | Images: ${images.length} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}gen / ${result.prompt_eval_count ?? "?"}img+prompt_\n_Reports only; severity and domain judgment stay with the attended session._`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("mcp-ollama fatal:", err);
  process.exit(1);
});
