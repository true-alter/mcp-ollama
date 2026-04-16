# Security Policy

## Reporting a vulnerability

Email **security@truealter.com** with:

- A description of the issue and the surface it affects.
- Reproduction steps (ideally a minimal MCP client script that triggers it).
- Your assessment of impact — local-only footgun, network-reachable issue, anything in between.

We aim to acknowledge within 3 business days and agree a disclosure window with you before any public fix lands. PGP-encrypted reports welcome if you prefer — keys on request at the same address.

Please do not open public GitHub issues for vulnerabilities.

## Scope

`mcp-ollama` is an MCP server that forwards requests to an Ollama HTTP endpoint. The server itself:

- Makes no outbound network request other than to the configured `OLLAMA_HOST`.
- Ships no model weights.
- Runs no background process, no auto-update, no telemetry pinger.
- Is stateless between tool calls — no on-disk cache.

In-scope concerns include prompt-injection vectors that let a malicious tool payload escape the request boundary, missing input validation on the Ollama HTTP wire, supply-chain issues in the `dist/` publish surface, and Dockerfile footguns.

Out-of-scope concerns include vulnerabilities in Ollama itself (report upstream at [github.com/ollama/ollama](https://github.com/ollama/ollama)) and in the MCP SDK (report upstream at [github.com/modelcontextprotocol](https://github.com/modelcontextprotocol)).

## Supported versions

Only the most recent `1.x` release receives security fixes. There is no long-term support branch.

## Coordinated disclosure

If a disclosure involves both `mcp-ollama` and upstream Ollama or the MCP SDK, we will coordinate timing with the upstream maintainers. We prefer agreed disclosure windows over embargoed surprise drops.
