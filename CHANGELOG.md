# Changelog

All notable changes to `mcp-ollama` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-01

First release published to npm. Everything below has been in the repository
and reachable only by cloning it.

### Changed

- README install section leads with `npm install -g @truealter/mcp-ollama` /
  `npx -y @truealter/mcp-ollama` instead of a `git clone` path; the package is
  distributed via npm and end-users should never need to visit GitHub
  to install it. The SCOPED name is the correct one: the unscoped `mcp-ollama`
  on the public registry belongs to an unrelated publisher.
- The client-registration step no longer points at `$PWD/dist/index.js` from a
  clone. A reader who installed the package has no clone, so the path it told
  them to write did not exist on their machine.
- The release workflow now cuts a GitHub release on every publish, with the
  notes read from this file keyed on the version rather than on position. This
  is the same mechanism the CLI and SDK mirrors carry.
- Cross-reference to `@truealter/sdk` in the closing section now points at the
  npm package page rather than the GitHub repo. An earlier entry claimed this
  was already done; the table still carried the repository link, so it is done
  here.

### Security

- `local_pull` validates the model-name argument before forwarding it to the
  Ollama daemon, and the validation now rejects a registry host. Ollama reads
  `host/namespace/name` as an alternate registry, so the first version of this
  check, which allowed a dot anywhere, let a caller name any origin and have
  the daemon fetch a manifest and then blobs from it onto the user's disk. The
  namespace segment no longer admits a dot, which is what makes a segment a
  hostname. The same edit accepts the tag separator, which the first version
  omitted, so ordinary names like `qwen2.5:14b` work where they previously did
  not.
- `local_vision` bounds what it reads. An image argument is a caller-supplied
  path, and the tool base64-encoded whatever it was pointed at with no type
  check and no size limit, so a large file took the process down and any file
  at all was read. Reads are now capped per file and refused unless the bytes
  begin with a PNG or JPEG signature.
- The `@modelcontextprotocol/sdk` floor moves to `^1.23.0`. The SDK accepts
  zod v4 schemas only from that version, and this package declares zod v4, so
  a consumer resolving to an older SDK inside the previous range published ten
  tools with empty argument schemas while reporting a successful handshake.
  Silent and total, and the committed lockfile meant it never appeared in CI.
- The registry publisher binary is verified against a pinned digest before it
  is executed. It was fetched by release tag, which is mutable, in a job that
  holds `id-token: write`.
- `OLLAMA_HOST` is now gated to loopback (`localhost` / `127.0.0.1` /
  `::1`) at startup. Operators with a legitimate remote-Ollama
  deployment must opt in explicitly via `MCP_OLLAMA_ALLOW_REMOTE=1`;
  the default refuses non-loopback hosts so a tampered env cannot be
  used to exfiltrate prompts.

### Added

- `local_vision` is documented for the first time. It has been in the server
  and in the README's tool table since before this file mentioned it, which
  left the changelog reading nine tools against a server that ships ten.
- `CONTRIBUTING.md` and `SECURITY.md` for the public repo.
- Docker usage, troubleshooting, security-posture, and model-selection
  guidance in the README.
- `license`, `repository`, `homepage`, `bugs`, `author`, `keywords`,
  `engines`, and `files` fields in `package.json`; `bin` entry for
  `mcp-ollama` so the package can run as a global CLI.
- `prepublishOnly` script to guarantee a fresh build before npm publish.

## [0.1.0] - 2026-05-18

### Changed

- Re-baselined version line to suite consistency. Pre-launch posture; semver 1.0
  reserved for stable public API. Supersedes the never-tagged 1.0.0 line on
  package.json, package-lock.json, server.json, and the in-process MCP server
  identifier.

### Added

- Initial public release. Nine tools (`local_generate`, `local_summarize`,
  `local_analyze`, `local_draft`, `local_code`, `local_diff`,
  `local_transform`, `local_models`, `local_pull`) exposed over MCP stdio
  transport.
- `Dockerfile` for the Glama server-tier listing.
- `server.json` entry for the MCP registry.
- GitHub Actions CI (Node 18 / 20 / 22 matrix).
- Apache-2.0 license.
