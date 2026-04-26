# Changelog

All notable changes to `mcp-ollama` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- `local_pull` now validates the model-name argument against
  `^[a-z0-9][a-z0-9._/-]{0,127}$` before forwarding to the Ollama
  registry, closing a Wave-3 pentest finding where caller-controlled
  model strings reached the pull endpoint unsanitised.
- `OLLAMA_HOST` is now gated to loopback (`localhost` / `127.0.0.1` /
  `::1`) at startup. Operators with a legitimate remote-Ollama
  deployment must opt in explicitly via `MCP_OLLAMA_ALLOW_REMOTE=1`;
  the default refuses non-loopback hosts so a tampered env cannot be
  used to exfiltrate prompts.

### Added

- `CONTRIBUTING.md` and `SECURITY.md` for the public repo.
- Docker usage, troubleshooting, security-posture, and model-selection
  guidance in the README.
- `license`, `repository`, `homepage`, `bugs`, `author`, `keywords`,
  `engines`, and `files` fields in `package.json`; `bin` entry for
  `mcp-ollama` so the package can run as a global CLI.
- `prepublishOnly` script to guarantee a fresh build before npm publish.

## [1.0.0] — 2026-04-15

### Added

- Initial public release. Nine tools (`local_generate`, `local_summarize`,
  `local_analyze`, `local_draft`, `local_code`, `local_diff`,
  `local_transform`, `local_models`, `local_pull`) exposed over MCP stdio
  transport.
- `Dockerfile` for the Glama server-tier listing.
- `server.json` entry for the MCP registry.
- GitHub Actions CI (Node 18 / 20 / 22 matrix).
- Apache-2.0 license.
