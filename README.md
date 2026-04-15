# mcp-ollama

MCP server wrapping local [Ollama](https://ollama.com) models for offload from API-priced orchestrators.

Exposes 9 tools that pass work to a local model (text generation, summarisation, code tasks, mechanical transforms, commit/PR/changelog drafting). The orchestrator decides what to route locally; this server does the routing.

- **Transport:** stdio
- **Runtime:** Node 18+
- **Default model:** `hermes3:8b` (override via `OLLAMA_MODEL`)
- **Ollama host:** `http://localhost:11434` (override via `OLLAMA_HOST`)
- **License:** Apache-2.0

## Install

```bash
npm install
npm run build
```

You also need a running Ollama instance with at least one model pulled:

```bash
ollama pull hermes3:8b
ollama pull qwen2.5-coder:32b  # optional, for local_code
```

## Run (stdio)

```bash
node dist/index.js
```

## Configure Claude Code

```bash
claude mcp add --transport stdio ollama -- node /absolute/path/to/mcp-ollama/dist/index.js
```

Or in `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "ollama": {
      "transport": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/mcp-ollama/dist/index.js"],
      "env": {
        "OLLAMA_HOST": "http://localhost:11434",
        "OLLAMA_MODEL": "hermes3:8b"
      }
    }
  }
}
```

## Tools

| Tool              | Purpose                                                                  |
|-------------------|--------------------------------------------------------------------------|
| `local_generate`  | General-purpose generation with system + user prompt                     |
| `local_summarize` | Summarise a blob of text                                                 |
| `local_analyze`   | Analyse text against a specific question                                 |
| `local_draft`     | Draft content in a given style                                           |
| `local_code`      | Code tasks: docstring / test / explain / review / types / refactor-suggest |
| `local_diff`      | Diff-driven tasks: commit-message / pr-description / changelog / summary / impact |
| `local_transform` | Mechanical code transformations                                          |
| `local_models`    | List models available on the local Ollama host                           |
| `local_pull`      | Pull a model onto the local Ollama host                                  |

Full tool schemas are exposed over MCP introspection.

## Environment variables

| Variable       | Default                     | Purpose                                           |
|----------------|-----------------------------|---------------------------------------------------|
| `OLLAMA_HOST`  | `http://localhost:11434`    | Ollama HTTP endpoint                              |
| `OLLAMA_MODEL` | `hermes3:8b`                | Default model when a tool call omits `model`      |

## Why

Orchestrators priced by the token (Claude Code, Cursor, the Anthropic API) pay for every classification, every docstring, every commit message. Most of that work doesn't need Opus or GPT-5. Routed to Ollama on the same machine, the same work is free and faster. `mcp-ollama` is the routing surface.

## Part of ALTER

`mcp-ollama` is maintained by [ALTER](https://truealter.com) as part of the identity infrastructure for the AI economy. The ALTER identity MCP server is hosted at `mcp.truealter.com`.
