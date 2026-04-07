#!/usr/bin/env node
/**
 * MCP server wrapping local Ollama models for Claude Code delegation.
 *
 * Opus stays as the orchestrator — this server lets it offload bulk
 * generation work (summarisation, extraction, drafting, classification)
 * to a local model running on the user's hardware.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "hermes3:8b";
async function ollamaGenerate(model, system, prompt, temperature = 0.3, maxTokens = 2048) {
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
    return (await res.json());
}
async function ollamaList() {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok)
        throw new Error(`Ollama list failed: ${res.status}`);
    const data = (await res.json());
    return data.models;
}
async function ollamaPull(model) {
    const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: model, stream: false }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Ollama pull failed ${res.status}: ${body}`);
    }
    const data = (await res.json());
    return data.status;
}
function formatDuration(ns) {
    if (!ns)
        return "unknown";
    const ms = ns / 1_000_000;
    return ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}
// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new McpServer({
    name: "mcp-ollama",
    version: "1.0.0",
});
// -- local_generate ---------------------------------------------------------
// General-purpose text generation. Use this for any task that doesn't need
// Opus-level reasoning: summaries, explanations, boilerplate, drafts, etc.
server.tool("local_generate", `General-purpose local LLM generation. Delegates work to a local Ollama model
to save tokens. Use this when the task is bulk text processing that doesn't
require Opus-level reasoning: summarising documents, explaining code for docs,
generating boilerplate, reformatting content, translating, etc.

The local model (default: hermes3:8b) runs on the user's hardware — zero
API cost, ~40 tok/s on a decent GPU.`, {
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
}, async ({ prompt, system, model, temperature, max_tokens }) => {
    const result = await ollamaGenerate(model ?? DEFAULT_MODEL, system ?? "You are a helpful assistant. Be concise and direct.", prompt, temperature ?? 0.3, max_tokens ?? 2048);
    return {
        content: [
            {
                type: "text",
                text: `${result.response}\n\n---\n_Model: ${result.model} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
            },
        ],
    };
});
// -- local_summarize --------------------------------------------------------
server.tool("local_summarize", `Summarise long text locally. Use this instead of having Opus process large
blocks of text when you only need a summary. Feed in file contents, docs,
logs, or any bulk text and get a concise summary back.

Particularly valuable for: large file contents, documentation, log output,
meeting notes, long git diffs, error traces.`, {
    content: z.string().describe("The text to summarise"),
    focus: z
        .string()
        .optional()
        .describe("What to focus on in the summary (e.g., 'security issues', 'API changes', 'key decisions')"),
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
}, async ({ content, focus, format, model, max_tokens }) => {
    const fmt = format ?? "bullets";
    const focusInstruction = focus ? `Focus specifically on: ${focus}.` : "";
    const system = `You are a precise summarisation assistant. Produce clear, accurate summaries. Never fabricate information not present in the source text. Use Australian English.`;
    const prompt = `Summarise the following text in ${fmt} format. ${focusInstruction}

---
${content}
---

Summary:`;
    const result = await ollamaGenerate(model ?? DEFAULT_MODEL, system, prompt, 0.2, max_tokens ?? 1024);
    return {
        content: [
            {
                type: "text",
                text: `${result.response}\n\n---\n_Model: ${result.model} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
            },
        ],
    };
});
// -- local_analyze ----------------------------------------------------------
server.tool("local_analyze", `Extract structured information from text locally. Use this for classification,
entity extraction, tagging, pattern recognition, or any task that transforms
unstructured text into structured output.

Good for: categorising issues, extracting names/dates/amounts, tagging content,
parsing semi-structured data, sentiment analysis.`, {
    content: z.string().describe("The text to analyse"),
    task: z
        .string()
        .describe("What to extract or analyse (e.g., 'extract all API endpoints mentioned', 'classify the sentiment', 'list all named entities')"),
    output_format: z
        .string()
        .optional()
        .describe("Desired output structure (e.g., 'JSON array', 'markdown table', 'key: value pairs')"),
    model: z
        .string()
        .optional()
        .describe(`Ollama model to use (default: ${DEFAULT_MODEL})`),
}, async ({ content, task, output_format, model }) => {
    const formatInstruction = output_format
        ? `Output the results as: ${output_format}.`
        : "Output the results in the clearest structured format.";
    const system = `You are a precise information extraction assistant. Extract exactly what is asked for — nothing more. Be accurate and complete. ${formatInstruction}`;
    const prompt = `Task: ${task}

Text to analyse:
---
${content}
---

Results:`;
    const result = await ollamaGenerate(model ?? DEFAULT_MODEL, system, prompt, 0.1, 2048);
    return {
        content: [
            {
                type: "text",
                text: `${result.response}\n\n---\n_Model: ${result.model} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
            },
        ],
    };
});
// -- local_draft ------------------------------------------------------------
server.tool("local_draft", `Draft text locally — commit messages, PR descriptions, docstrings, changelog
entries, documentation sections, or any formulaic text that follows a template
or convention. Saves Opus tokens on boilerplate generation.`, {
    task: z
        .string()
        .describe("What to draft (e.g., 'commit message for these changes', 'docstring for this function')"),
    context: z
        .string()
        .describe("The context/input the draft should be based on (e.g., diff output, function code, change description)"),
    style: z
        .string()
        .optional()
        .describe("Style guide or conventions to follow (e.g., 'imperative mood, max 72 chars subject line')"),
    model: z
        .string()
        .optional()
        .describe(`Ollama model to use (default: ${DEFAULT_MODEL})`),
}, async ({ task, context, style, model }) => {
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
    const result = await ollamaGenerate(model ?? DEFAULT_MODEL, system, prompt, 0.4, 1024);
    return {
        content: [
            {
                type: "text",
                text: `${result.response}\n\n---\n_Model: ${result.model} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
            },
        ],
    };
});
// -- local_code -------------------------------------------------------------
// Code-aware generation: Claude reads code via Read/Grep, passes it here
// for the actual text generation (docstrings, tests, explanations, reviews).
server.tool("local_code", `Code-aware local generation. Claude reads source code with Read/Grep (free),
then delegates the TEXT GENERATION to local — docstrings, test stubs,
explanations, type annotations, inline comments, or review feedback.

This is the primary tool for reducing API token usage on code tasks.
Claude orchestrates (decides what code to read, what task to perform),
but the actual generation happens locally at zero API cost.

Accepts up to ~12K tokens of code context (16K model context minus overhead).
For larger contexts, break into focused chunks (one function, one class).`, {
    code: z
        .string()
        .describe("Source code to work with — a function, class, module, or diff"),
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
        .describe("What to generate: docstring (generate docstring), test (generate test stub), explain (explain the code), review (style/pattern review — NOT security), types (add type annotations), comments (add inline comments), refactor-suggest (suggest improvements)"),
    language: z
        .string()
        .describe("Programming language (e.g., 'python', 'typescript')"),
    context: z
        .string()
        .optional()
        .describe("Additional context: file path, project conventions, what the function is used for, etc."),
    model: z
        .string()
        .optional()
        .describe(`Ollama model to use (default: ${DEFAULT_MODEL})`),
}, async ({ code, task, language, context, model }) => {
    const contextNote = context ? `\nAdditional context: ${context}` : "";
    const taskPrompts = {
        docstring: {
            system: `You are a documentation expert. Write clear, concise docstrings following ${language} conventions. Use Australian English for prose, US English for identifiers. Include parameter types, return types, and a brief description. Do NOT include the original code — only output the docstring.`,
            instruction: `Write a docstring for the following ${language} code.${contextNote}`,
        },
        test: {
            system: `You are a test engineer. Generate test stubs with clear test names and arrange/act/assert structure. Use pytest for Python, Jest for TypeScript/JavaScript. Include edge cases. Output ONLY the test code.`,
            instruction: `Generate test stubs for the following ${language} code. Cover the main path and key edge cases.${contextNote}`,
        },
        explain: {
            system: `You are a senior developer explaining code to a colleague. Be concise — explain WHAT it does and WHY, not line-by-line. Use Australian English. Mention non-obvious design choices or gotchas.`,
            instruction: `Explain the following ${language} code.${contextNote}`,
        },
        review: {
            system: `You are a code reviewer focused on style, patterns, naming, readability, and correctness. Do NOT review for security (that stays on Opus). Flag issues as: [STYLE], [NAMING], [BUG], [PATTERN], [READABILITY]. Be specific — cite the line or construct.`,
            instruction: `Review the following ${language} code for style, patterns, and correctness.${contextNote}`,
        },
        types: {
            system: `You are a typing expert. Add type annotations to the code following ${language} best practices (PEP 484 for Python, strict TypeScript). Output the full code with types added. Do NOT change logic.`,
            instruction: `Add type annotations to the following ${language} code.${contextNote}`,
        },
        comments: {
            system: `You are adding inline comments to code. Only comment non-obvious logic — do NOT comment self-evident code. Comments should explain WHY, not WHAT. Use Australian English.`,
            instruction: `Add inline comments to non-obvious parts of the following ${language} code.${contextNote}`,
        },
        "refactor-suggest": {
            system: `You are a senior developer suggesting refactoring improvements. Focus on: reducing complexity, improving naming, extracting helpers where justified (not premature abstraction), removing duplication. Do NOT suggest changes for their own sake — only flag genuine improvements. Output a numbered list of suggestions with brief rationale.`,
            instruction: `Suggest refactoring improvements for the following ${language} code.${contextNote}`,
        },
    };
    const { system, instruction } = taskPrompts[task];
    const prompt = `${instruction}

\`\`\`${language}
${code}
\`\`\``;
    const result = await ollamaGenerate(model ?? DEFAULT_MODEL, system, prompt, task === "test" || task === "types" ? 0.2 : 0.3, 4096);
    return {
        content: [
            {
                type: "text",
                text: `${result.response}\n\n---\n_Model: ${result.model} | Task: ${task} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
            },
        ],
    };
});
// -- local_diff -------------------------------------------------------------
// Summarise or analyse diffs locally — saves API tokens on PR descriptions,
// changelog entries, and commit messages from large diffs.
server.tool("local_diff", `Analyse a git diff locally. Use this for generating commit messages,
PR descriptions, changelog entries, or understanding what changed in a diff.
Claude runs \`git diff\` (free), passes the output here for text generation.

Particularly valuable for large diffs that would consume many API tokens
if processed by Opus/Sonnet directly.`, {
    diff: z.string().describe("The git diff output"),
    task: z
        .enum(["commit-message", "pr-description", "changelog", "summary", "impact"])
        .describe("What to generate: commit-message, pr-description, changelog (categorised entries), summary (what changed), impact (what might break)"),
    style: z
        .string()
        .optional()
        .describe("Style conventions (e.g., 'imperative mood, 72 char subject')"),
    model: z
        .string()
        .optional()
        .describe(`Ollama model to use (default: ${DEFAULT_MODEL})`),
}, async ({ diff, task, style, model }) => {
    const styleNote = style ? `\nFollow these conventions: ${style}` : "";
    const taskPrompts = {
        "commit-message": {
            system: `You are writing a git commit message. Use imperative mood for the subject line (max 72 chars). Add a body with bullet points if the diff is non-trivial. Focus on WHY, not WHAT. Use Australian English for prose.${styleNote}`,
            instruction: "Write a commit message for the following diff.",
        },
        "pr-description": {
            system: `You are writing a pull request description. Structure: ## Summary (2-3 bullet points), ## Changes (categorised list), ## Test plan (what to verify). Be concise. Use Australian English.${styleNote}`,
            instruction: "Write a PR description for the following diff.",
        },
        changelog: {
            system: `You are writing changelog entries. Categorise as: Added, Changed, Fixed, Removed, Security, Infrastructure. Each entry should describe what changed from the user's perspective — not file names. Use Australian English.${styleNote}`,
            instruction: "Write categorised changelog entries for the following diff.",
        },
        summary: {
            system: `You are summarising code changes. Be concise — what changed and why. Group related changes. Use Australian English.${styleNote}`,
            instruction: "Summarise the following diff.",
        },
        impact: {
            system: `You are analysing the potential impact of code changes. List: what might break, what needs testing, what external systems are affected. Be specific — cite file paths and function names from the diff.${styleNote}`,
            instruction: "Analyse the potential impact of the following diff. What might break?",
        },
    };
    const { system, instruction } = taskPrompts[task];
    const prompt = `${instruction}\n\n\`\`\`diff\n${diff}\n\`\`\``;
    const result = await ollamaGenerate(model ?? DEFAULT_MODEL, system, prompt, 0.3, task === "commit-message" ? 512 : 2048);
    return {
        content: [
            {
                type: "text",
                text: `${result.response}\n\n---\n_Model: ${result.model} | Task: ${task} | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
            },
        ],
    };
});
// -- local_transform --------------------------------------------------------
// Mechanical code transformations that don't need reasoning.
server.tool("local_transform", `Perform mechanical code transformations locally. These are pattern-based
transforms that don't require architectural understanding — the kind of
work that burns API tokens for no good reason.

Use this for: converting between formats, renaming patterns, migrating
syntax, generating boilerplate from examples, etc.`, {
    input: z.string().describe("The input code or text to transform"),
    transform: z
        .string()
        .describe("What transformation to apply (e.g., 'convert class component to functional React component', 'convert these SQL queries to SQLAlchemy ORM', 'rename all instances of oldName to newName and update references', 'convert this JSON schema to Pydantic models')"),
    language: z
        .string()
        .optional()
        .describe("Target programming language"),
    model: z
        .string()
        .optional()
        .describe(`Ollama model to use (default: ${DEFAULT_MODEL})`),
}, async ({ input, transform, language, model }) => {
    const langNote = language ? ` Output in ${language}.` : "";
    const system = `You are a code transformation tool. Apply the requested transformation precisely. Output ONLY the transformed code — no explanations, no markdown fences unless the input had them. Preserve formatting and style conventions.${langNote}`;
    const prompt = `Transformation: ${transform}

Input:
${input}

Output:`;
    const result = await ollamaGenerate(model ?? DEFAULT_MODEL, system, prompt, 0.1, 4096);
    return {
        content: [
            {
                type: "text",
                text: `${result.response}\n\n---\n_Model: ${result.model} | Transform | Time: ${formatDuration(result.total_duration)} | Tokens: ${result.eval_count ?? "?"}_`,
            },
        ],
    };
});
// -- local_models -----------------------------------------------------------
server.tool("local_models", `List all models available in the local Ollama instance. Use this to check
what models are loaded and available for delegation.`, {}, async () => {
    const models = await ollamaList();
    const lines = models.map((m) => {
        const sizeGB = (m.size / 1_073_741_824).toFixed(1);
        const params = m.details?.parameter_size ?? "?";
        const quant = m.details?.quantization_level ?? "?";
        const family = m.details?.family ?? "?";
        return `- **${m.name}** — ${sizeGB} GB, ${params} params, ${quant} quantisation, family: ${family}`;
    });
    return {
        content: [
            {
                type: "text",
                text: lines.length > 0
                    ? `Available Ollama models:\n\n${lines.join("\n")}`
                    : "No models currently loaded in Ollama.",
            },
        ],
    };
});
// -- local_pull -------------------------------------------------------------
server.tool("local_pull", `Pull/download a model into Ollama from the registry, or import a local GGUF
file. Use this to make additional models available for delegation.

For GGUF files, create an Ollama Modelfile first, then use 'ollama create'.
This tool handles registry pulls (e.g., 'qwen2.5:14b', 'deepseek-r1:8b').`, {
    model: z
        .string()
        .describe("Model to pull (e.g., 'qwen2.5:14b', 'mistral-nemo', 'deepseek-r1:8b')"),
}, async ({ model }) => {
    const status = await ollamaPull(model);
    return {
        content: [
            {
                type: "text",
                text: `Pull complete: ${model} — ${status}`,
            },
        ],
    };
});
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
