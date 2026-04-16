# mcp-ollama

[![Glama score](https://glama.ai/mcp/servers/true-alter/mcp-ollama/badges/score.svg)](https://glama.ai/mcp/servers/true-alter/mcp-ollama)

MCP server wrapping local [Ollama](https://ollama.com) models for offload from API-priced orchestrators.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](#install)
[![MCP](https://img.shields.io/badge/MCP-stdio-blueviolet.svg)](https://modelcontextprotocol.io)

Exposes nine tools that pass work to a local model (text generation, summarisation, code tasks, mechanical transforms, commit/PR/changelog drafting). The orchestrator decides what to route locally; this server does the routing.

- **Transport:** stdio
- **Runtime:** Node 18+
- **Default model:** `hermes3:8b` (override via `OLLAMA_MODEL`)
- **Ollama host:** `http://localhost:11434` (override via `OLLAMA_HOST`)
- **Ships no model weights, no cloud call-outs, no telemetry.** Every request stays on the host where Ollama is running.
- **License:** Apache-2.0

## Why

Orchestrators priced by the token (Claude Code, Cursor, the Anthropic API, Cline, Aider) pay for every classification, every docstring, every commit message. Most of that work doesn't need a frontier model. Routed to Ollama on the same machine, the same work is free and faster. `mcp-ollama` is the routing surface.

The orchestrating model decides what to route where. This server is plumbing — it does not try to be clever about task classification. Pick the right tool, pass the text, get a result back.

## Install

### From source

```bash
git clone https://github.com/true-alter/mcp-ollama.git
cd mcp-ollama
npm install
npm run build
```

You also need a running Ollama instance with at least one model pulled:

```bash
# Default — 8B, fast, good for classifications and short generations
ollama pull hermes3:8b

# Optional — code-specialised, heavier, better for local_code tasks
ollama pull qwen2.5-coder:32b
```

### Docker

```bash
docker build -t mcp-ollama .
docker run -i --rm \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  -e OLLAMA_MODEL=hermes3:8b \
  mcp-ollama
```

The supplied `Dockerfile` points at `host.docker.internal:11434` so the container reaches Ollama on the host.

## Run (stdio)

```bash
node dist/index.js
```

Stdio servers are launched by the MCP client (Claude Code, Cursor, etc.) — running it directly is only useful for debugging.

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

Full tool schemas are exposed over MCP introspection — any MCP-aware client will enumerate them automatically.

## Environment variables

| Variable       | Default                     | Purpose                                           |
|----------------|-----------------------------|---------------------------------------------------|
| `OLLAMA_HOST`  | `http://localhost:11434`    | Ollama HTTP endpoint                              |
| `OLLAMA_MODEL` | `hermes3:8b`                | Default model when a tool call omits `model`      |

Any tool call may override `model` explicitly — the env default only applies when unset. `local_code` tends to work better with a code-specialised model passed per-call, while `local_summarize` and `local_draft` are fine on the default.

## Model selection guidance

| Workload                               | Recommended model          | Rationale                                     |
|----------------------------------------|----------------------------|-----------------------------------------------|
| Classification, one-liners, tags       | `hermes3:8b`               | Fastest round-trip, cheap to run              |
| Commit messages, changelogs, summaries | `qwen2.5-14b-instruct`     | Higher quality, still comfortable on 16GB GPU |
| Code review, docstrings, tests         | `qwen2.5-coder:32b`        | Code-specialised                              |
| Fallback / unknown model               | whatever `local_models` returns | Inspect first, then route                 |

Use `local_models` at session start if you're unsure what's available on a host.

## Troubleshooting

**`Ollama error 404` when calling a tool.** The model isn't pulled. Run `ollama pull <name>` or call `local_pull` from the client.

**`fetch failed` / connection refused.** Ollama isn't running, or `OLLAMA_HOST` points somewhere wrong. Verify with `curl $OLLAMA_HOST/api/tags`. Inside a container, `localhost` is the container itself — use `host.docker.internal` on macOS/Windows or a bridge IP on Linux.

**Tool calls feel slow.** First call to a cold model incurs a load. Subsequent calls within the same Ollama process are much faster. If the model is larger than available VRAM, Ollama falls back to CPU — watch `ollama ps` to confirm.

**Empty or truncated output.** `max_tokens` defaults to 2048 per tool. For long generations, pass `max_tokens` explicitly in the tool call.

## Security posture

`mcp-ollama` makes no network call of its own beyond the configured `OLLAMA_HOST`. It ships no telemetry, no analytics, no auto-update pinger. Tool inputs are forwarded to Ollama's HTTP API verbatim and the response is relayed back; the server itself is stateless between calls.

If you run Ollama on `localhost` (the default) the entire loop stays on the host. If you point `OLLAMA_HOST` at a remote endpoint, treat that endpoint's security posture as authoritative — a typo sending prompts to a third-party host is trivially possible.

To report a security issue, see [SECURITY.md](./SECURITY.md).

## Contributing

Bug reports and small patches welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Larger design changes: please open an issue first so we can talk about scope before you invest time.

## Part of ALTER

`mcp-ollama` is maintained by [ALTER](https://truealter.com) as part of the identity infrastructure for the AI economy. The ALTER identity MCP server is hosted at `mcp.truealter.com` — see [`@truealter/sdk`](https://github.com/true-alter/alter-identity) for the TypeScript client.

## License

Apache License 2.0. See [LICENSE](./LICENSE) for the full text. Copyright 2026 Alter Meridian Pty Ltd (ABN 54 696 662 049).
