# Contributing to mcp-ollama

Thanks for the interest. `mcp-ollama` is small and intentionally stays that way — routing work to a local Ollama process is the whole brief.

## Reporting bugs

[Open an issue](https://github.com/true-alter/mcp-ollama/issues) with:

- The tool you called, the client you called it from, and the model you were routing to.
- The exact error message (full stderr if available).
- Node version (`node --version`) and Ollama version (`ollama --version`).
- Whether the underlying Ollama call reproduces via `curl` — helps us distinguish "server bug" from "Ollama is broken here".

## Small patches

Typo fixes, README clarifications, tightening error messages, bumping a dependency: open a PR. Keep the diff surgical.

```bash
git clone https://github.com/true-alter/mcp-ollama.git
cd mcp-ollama
npm install
npm run build
node dist/index.js  # smoke test against your client of choice
```

## Larger design changes

Open an issue **before** the PR so we can talk about scope. Specifically: we are not trying to absorb task-classification logic into this server. The orchestrating model decides what to route where; this repo is plumbing. Proposals that move intelligence into the server itself will generally land as "thanks, but no."

## Style

- TypeScript, strict mode. No `any` without a justifying comment.
- ESM, top-level `await` is fine.
- Prose: Australian English in README/docs, US English in code (`color`, `initialize`) to match ecosystem conventions.
- No telemetry, no auto-update pingers, no background network activity — if a PR introduces any, it will not land.

## Licensing

By submitting a pull request you agree that your contribution is licensed under Apache-2.0, matching the rest of the repository.
