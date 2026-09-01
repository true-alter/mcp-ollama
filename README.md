<div align="center">

<img src="https://raw.githubusercontent.com/true-alter/mcp-ollama/main/docs/alter-mark.svg" alt="" height="96">

# ~alter mcp-ollama

**Hands the work that shouldn't leave your machine to the model already sitting on it**

[![~alter](https://img.shields.io/badge/~alter-identity%20infrastructure-C9A84C?style=flat-square)](https://truealter.com)
[![MCP](https://img.shields.io/badge/MCP-stdio-555?style=flat-square)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-555?style=flat-square)](#install)
[![Licence](https://img.shields.io/badge/licence-Apache--2.0-555?style=flat-square)](./LICENSE)

[What it does](#what-is-mcp-ollama) · [Install](#install) · [The tools](#the-tools) · [Why this sits under ~alter](#why-this-sits-under-alter)

</div>

## What is mcp-ollama?

An MCP server that hands work to [Ollama](https://ollama.com) on the same
machine and passes the answer back. Ten tools over stdio. Your client calls one
of them, Ollama does the generating on your own GPU, and nothing is charged to
an API account.

Most of a working session is mechanical. Docstrings, commit messages, PR
descriptions, changelog entries, classification and tagging, summarising a long
file, converting one format into another, and having a small vision model look
at a screenshot and report what's on screen. None of that needs a frontier
model, and most of it gets one anyway, because that's what your client already
has an API key for.

Hand it a staged diff and a commit message comes back. Hand it a chunk of
source and you get a docstring, a test stub or a set of type annotations. All
ten tools, and what each one takes, are in [the tools](#the-tools).

The orchestrator decides what gets routed here. This server makes no judgement
about what belongs local, and it doesn't stream, queue or cache. It keeps
nothing between calls beyond a random identifier for the process it's running
in.

It depends on two things and ships neither. Node 18 or newer runs it, and a
running Ollama with at least one model pulled does the actual generating. There
are no weights in this repository and no download of weights at install time.
The default model is `hermes3:8b`, which you can override per call or per
environment.

## Why this sits under ~alter

You already decided that some work stays here. That's why there's a model on
this disk, pulled once and left there, instead of an API key doing the same job
from a datacentre you'll never see. ~alter starts from the same decision and
points it at the other thing that leaves your machine constantly, which is the
record of who you are.

Nothing on this machine answers that well today. Your account is a password at a
login screen and a token in a config file, and each of those checks one moment
and then stops looking. The years of work that actually say who you are sit
outside anything either of them can see. An agent commits under your name now,
in your editor, and when somebody asks later who allowed that, there's no
answer written down anywhere.

~alter answers that with a handle. `~yourname`, one of them, carrying a record
built out of work you actually did. A client speaking the protocol picks it up
without being configured again, much the way this server picks up a model you
pulled once and left on the disk.

You bought hardware to stop paying per call. On that record the per-call money
runs the other way. The bare fact that you exist is free for anyone to check,
depth past that is charged to whoever wants it, and you're the one who decides
which readers reach which depth.

None of it is needed here. `mcp-ollama` has no login and asks for no handle, and
it behaves the same whether you hold one or not. There's one small wire between
them and it's worth naming plainly. If the ~alter runtime happens to be
installed on this machine, every local generation appends a single line to a
file in your own home directory, recording that the work ran here at no API
cost. That line never goes anywhere, and if the runtime isn't installed no line
gets written at all.

<details><summary><b>I want to know more</b></summary><br><p>Your friends do not know you from a login. Neither does your family, or the people you work with, or your sports team. They know who you are from how you have shown up, over years. You may look and sound nothing like you did ten years ago and it is still you.</p><p>Software still asks the narrow question. A password at the login screen. A token in the app. Each one checks whether this is the right person, right now, at this exact spot, and then looks away. Everything in between is invisible to it, and that is almost all of your life. The AI tools made it worse, because one of them writes in your name now, and when somebody asks who allowed it, there is no answer anywhere on this machine.</p><p><b>One name, and the record under it is yours.</b> <code>~yourname</code> works at every tool that speaks the protocol, so nothing is set up twice and there is no key to paste, at any point. What is in the record was read from what you did, not typed into a box by you or guessed at by a model. You can cut off access to any of it with one command. No form, no review.</p><p><b>Being read pays you.</b> Anyone can check for free that your handle exists. Reading further, past the fact of you, costs the reader money, that money goes to you, and you decide who gets to read what. Collectives hold a record on the same terms, because it is one record at every scale and the same form holds you, your team, and your country. A union, a club, a trade body, or a group of people who have never met can vouch for their own members and be read the same way you are.</p><p><b>Threads are how you get somewhere.</b> A thread is something you are working towards. You take one on yourself, or ~Alter plants one from what it can already see, or a collective confers one on you. What gets read is the trail you leave while you are doing it, never a certificate at the end.</p><p>All of that is the short version of an argument set out properly, in eight chapters at <a href="https://truealter.com/origin">truealter.com/origin</a>. Its seventy-six predictions were each written so the data could come back and say no. Five of them did, and those five are still published alongside the rest.</p></details>

<details><summary><b>I want to check it myself</b></summary>

None of it needs taking on trust. Hand this to the AI you already use and
let it take you through in your own words.

```text
Go to truealter.com, find the genesis and the origin papers, and read all of
them. Then start a discussion with me in my own language, no jargon.

Ask me one question at a time and wait for my answer. Follow what I am curious
about, not the order the site is written in.

Do not only read the pages. Connect to their interface directly and call
get_started. That tells you where I am and what comes next, and we work the
rest of this from there.

If I have a ~handle I will give it to you. If I do not and I decide I want
one, set it up with me here.

What I want to understand is what ~Alter is, how it applies to me, and what it
means for everyone else. Find me somewhere in it, and not the version written
for people who work in technology. Find the life nearest mine and walk me
through it, including what it would cost me.

Try to prove them wrong. Go and find where they show their working, and if
something is unclear or does not hold up, say so.
```

</details>

The ~alter command line is where a person meets ~alter, and this isn't that.
`mcp-ollama` has no command of its own worth typing and never asks you to log
in to anything. It's a process your MCP client starts and stops, and it
happens to be maintained by the same people.

## Install

```bash
npm install @truealter/mcp-ollama
```

The package ships the build already done. `dist/index.js`, the file your
client will point at, lands at
`node_modules/@truealter/mcp-ollama/dist/index.js` under wherever you ran the
install. CI builds it against Node 18, 20 and 22 before publish, so anything
in that range is known to work at runtime.

Nothing lands outside the directory you installed into. No global binary, no
PATH entry, no service, no background process.

## Routing your first job

### 1. Pull the model it reaches for by default

```bash
ollama pull hermes3:8b
```

That's the default this server reaches for when a tool call doesn't name a
model. It's quick and it's honest at classification, tagging and short
generations. Heavier models are worth having for code work, and
[choosing a model](#choosing-a-model) covers when to bother.

### 2. Register the server with your client

```bash
claude mcp add --transport stdio ollama -- node "$PWD/dist/index.js"
```

Run that from the directory you cloned into, or write the absolute path
yourself. Cursor, Cline and anything else MCP-aware take the same shape in
their own config. The client launches the process; you never run it by hand
except to debug, and if you do, `node dist/index.js` sits there waiting on
stdin, which is correct rather than broken.

### 3. Ask your client what is on the host

```text
List the models on the local Ollama host.
```

Say that to your client in whatever words you like. It resolves to
`local_models`, which reads Ollama's tag list and reports each model's size,
parameter count, quantisation and family. If what you just pulled comes back,
the wire is good end to end.

### 4. Hand it a diff and ask for a commit message

```bash
git diff --staged
```

Hand that output to your client and ask for a commit message. It routes to
`local_diff` with `commit-message`, which prompts for imperative mood, a subject
under 72 characters and a body explaining why rather than what. Nothing about
that needed a frontier model, and now it doesn't use one.

## The tools

| Tool | What it does |
|---|---|
| `local_generate` | Free-form generation with your own system prompt, temperature and token ceiling |
| `local_summarize` | Summarise bulk text as bullets, a paragraph or one line, optionally focused on a theme |
| `local_analyze` | Structure pulled out of text, classification, entities or tags, in an output shape you name |
| `local_draft` | Formulaic prose against a convention you supply |
| `local_code` | `docstring`, `test`, `explain`, `review`, `types`, `comments` or `refactor-suggest` over a chunk of source |
| `local_diff` | `commit-message`, `pr-description`, `changelog`, `summary` or `impact` from a diff |
| `local_transform` | Mechanical pattern transforms, format conversions, renames and syntax migrations |
| `local_models` | What's on this Ollama host, with sizes and quantisation |
| `local_pull` | Pull a model onto this host by name, untagged names only |
| `local_vision` | Have a vision model look at screenshots and report `see`, `emptystate` or `legibility` |

Ten of them, and the full schemas come over MCP introspection, so any MCP-aware
client enumerates them without being told.

Two take a `max_tokens` argument. `local_generate` defaults to 2048 and
`local_summarize` to 1024. The rest set their own ceiling in code, 4096 for
`local_code` and `local_transform`, 2048 for `local_analyze` and most of
`local_diff`, 512 for a commit message, 1024 for `local_draft`. If output comes
back cut short on one of those, split the input rather than hunting for a
parameter that isn't there. Temperature is exposed on `local_generate` only.

`local_vision` is the odd one and worth a note. It reads pixels and reports what
is on screen, whether the main content area holds real data or an error, which
regions exist, what text is clipped or unreadable. It deliberately doesn't rank
severity or approve anything, because a small vision model reads a render well
and judges it badly. Feed it near full resolution, because below about 1280px
wide it starts inventing data that isn't there.

## Choosing a model

| Variable | Default | What it does |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | Where Ollama is listening. Loopback only unless you override the gate below |
| `OLLAMA_MODEL` | `hermes3:8b` | Model used when a tool call doesn't name one |
| `OLLAMA_VISION_MODEL` | `qwen2.5vl:7b` | Model `local_vision` uses when a call doesn't name one |
| `MCP_OLLAMA_ALLOW_REMOTE` | unset | Set to `1` to permit a non-loopback `OLLAMA_HOST` |

Any call can name its own `model` and the environment default only applies when
it doesn't, so one server handles a mixed workload without being reconfigured.

| Workload | Try | Why |
|---|---|---|
| Classification, tagging, one-liners | `hermes3:8b` | Fastest round trip, cheap to keep resident |
| Commit messages, changelogs, summaries | `qwen2.5-14b-instruct` | Better prose, still comfortable on a 16GB card |
| Code review, docstrings, tests | `qwen2.5-coder:32b` | Code-specialised, worth the extra VRAM |
| Looking at a render | `qwen2.5vl:7b` | The vision default, and small enough to stay on the GPU |

Run `local_models` at the start of a session on a host you don't know.

<details><summary><h3>Running it in Docker</h3></summary>

No image is published anywhere, so every path below starts with a build from
this repository.

```bash
docker build -t mcp-ollama .
```

The `Dockerfile` builds on `node:20-alpine` and already sets `OLLAMA_HOST` to
`http://host.docker.internal:11434`, so the container reaches Ollama on the host
rather than looking for it inside itself. That address is not loopback from the
server's point of view, so the loopback gate refuses it and the process exits at
startup unless `MCP_OLLAMA_ALLOW_REMOTE=1` is set as well. The image does not
set that one, which is why every command here does.

The image also sets `OLLAMA_MODEL` to `hermes3:8b`. Add `-e OLLAMA_MODEL=...` to
route to a different default.

**Docker, on macOS and Windows**

```bash
docker run -i --rm -e MCP_OLLAMA_ALLOW_REMOTE=1 mcp-ollama
```

**Docker, on Linux**

`host.docker.internal` does not resolve there by default, so map it to the
bridge gateway.

```bash
docker run -i --rm \
  --add-host=host.docker.internal:host-gateway \
  -e MCP_OLLAMA_ALLOW_REMOTE=1 \
  mcp-ollama
```

**Docker Compose**

`docker-compose.yml` ships in this repository, so there is nothing to write. It
carries an `extra_hosts` mapping that makes the same file work on Linux as well
as Docker Desktop.

This server speaks MCP over stdin and stdout, so it needs a client on the other
end of the pipe. `docker compose up` starts it with nothing attached and it sits
there doing nothing. Use `run`, with `-T` so Compose leaves the pipe alone.

```bash
docker compose run --rm -T mcp-ollama
```

**Pointing a client at it**

An MCP client launches the server itself, so hand it the whole command rather
than a container that is already running.

```json
{
  "mcpServers": {
    "ollama": {
      "command": "docker",
      "args": ["compose", "-f", "/path/to/docker-compose.yml", "run", "--rm", "-T", "mcp-ollama"]
    }
  }
}
```

</details>

<details><summary><h3>When something doesn't work</h3></summary>

**`Ollama error 404` on a tool call**

That model isn't pulled. Run `ollama pull <name>` from a shell. `local_pull`
handles untagged names only, because its validator rejects the colon in a tag
like `hermes3:8b`.

**`fetch failed`, or connection refused**

Ollama isn't running, or `OLLAMA_HOST` points at the wrong place. Check with
`curl $OLLAMA_HOST/api/tags`. Inside a container, `localhost` is the container
itself.

**`OLLAMA_HOST must be loopback`, and the process dies immediately**

That's the gate doing its job. Point it back at `localhost`, or set
`MCP_OLLAMA_ALLOW_REMOTE=1` if you genuinely meant a remote host.

**Calls feel slow**

A cold model has to load first, and everything after that in the same Ollama
process is much faster. If the model is larger than your VRAM, Ollama spills
to CPU, and `ollama ps` will tell you so.

**Vision calls balloon memory or crawl**

`local_vision` caps context at 8192 and holds the model for 30 minutes on
purpose. A 32K context plus one image pushes past 23GB on a 7900-class card
and spills to CPU, which is where the cap came from.

**Output stops early**

See the token ceilings under [the tools](#the-tools). Most tools don't take
`max_tokens`.

</details>

<details><summary><h3>What this server does and doesn't do on your machine</h3></summary>

It makes no network call other than to the configured `OLLAMA_HOST`, and by
default that host has to be `localhost`, `127.0.0.1` or `::1`. A non-loopback
value throws at startup rather than quietly sending your prompts somewhere else,
and getting past that takes a deliberate `MCP_OLLAMA_ALLOW_REMOTE=1`. Point it
at a remote Ollama on purpose and that endpoint's posture becomes yours.

There's no telemetry, no analytics, no auto-update check and no model weights in
the package. Tool inputs go to Ollama's HTTP API as given and the response comes
straight back. Model names passed to `local_pull` are validated against
`^[a-z0-9][a-z0-9._/-]{0,127}$` before they reach the registry endpoint, so a
caller-supplied string can't wander off that path.

One local write is worth knowing about. If
`~/.local/share/alter-runtime/lib/substrate-emit.sh` exists, each generation
appends a row to `~/.local/share/alter-runtime/token-burn.jsonl` recording the
tool, the model and the token counts. It's fire and forget, it fails silently, it
never touches the tool result, and if that helper isn't installed nothing is
written.

To report a security issue, see [SECURITY.md](./SECURITY.md).

</details>

<details><summary><h3>The protocols underneath it</h3></summary>

The record formats are open Internet-Drafts, so somebody else's implementation reads and writes the same records this one does without asking us. These are the drafts this repository actually rests on.

| Draft | What it specifies |
|---|---|
| [`compute-location-gate`](https://datatracker.ietf.org/doc/draft-morrison-compute-location-gate/) | Negotiating where an identity inference computes, decided by the provenance class of the signal, before any inference runs. |
| [`mcp-dns-discovery`](https://datatracker.ietf.org/doc/draft-morrison-mcp-dns-discovery/) | The DNS records that publish a `~handle`, the server that answers for it, and the signed envelope bound to it. |

Eighteen drafts make up the whole stack. The rest are on the [IETF datatracker](https://datatracker.ietf.org/doc/search/?name=draft-morrison&activedrafts=on).

</details>

<details><summary><h3>The rest of it</h3></summary>

One identity rail, several ways in.

| Name | What it is |
|---|---|
| **[`@truealter/cli`](https://www.npmjs.com/package/@truealter/cli)** | The command line, and the front door for a person. |
| **[homebrew-tap](https://github.com/true-alter/homebrew-tap)** | That command line, packaged for macOS and Linux. |
| **[runtime](https://github.com/true-alter/runtime)** | The daemon that keeps your `~handle` known on your own machine. |
| **[sdk](https://github.com/true-alter/sdk)** | Reading identity from your own code. |
| **[obsidian](https://github.com/true-alter/obsidian)** | ~Alter inside an Obsidian vault, on-device. |
| **mcp-ollama** | Local models, for work that should stay on the machine it runs on. **You are here.** |

Documentation is at [truealter.com/docs](https://truealter.com/docs).

Bug reports and small patches are welcome, see
[CONTRIBUTING.md](./CONTRIBUTING.md). A report is most useful with the tool you
called, the client you called it from, the model you routed to, the full error,
and your Node and Ollama versions. For a larger design change, open an issue
first so we can agree the scope before you spend time on it.

`mcp-ollama` is small and stays that way. Routing work to a local Ollama process
is the whole brief.

Apache 2.0. See [LICENSE](./LICENSE) for the full text. Copyright 2026 Alter
Meridian Pty Ltd (ABN 54 696 662 049).

</details>

---

<div align="center">

<sub><b>~alter</b> is identity infrastructure. Your name is <code>~yourname</code> and claiming one is free.</sub>

<sub>
<a href="https://truealter.com">Website</a> &nbsp;·&nbsp;
<a href="https://truealter.com/docs">Docs</a> &nbsp;·&nbsp;
<a href="https://truealter.com/origin">The argument in eight chapters</a> &nbsp;·&nbsp;
<a href="https://datatracker.ietf.org/doc/search/?name=draft-morrison&activedrafts=on">The open specifications</a> &nbsp;·&nbsp;
<a href="https://github.com/true-alter">Every repository</a>
</sub>

</div>
