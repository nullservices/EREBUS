# E R E B U S

**Local autonomous AI agent command platform.**

EREBUS is a self-hosted, LAN-accessible orchestration environment for AI
agents. It runs on your Windows desktop, gives entities (agents) access to
local projects and tools, and presents the whole operation as a dark,
restrained command console — observable from any device on your network.

The browser is a control surface. The agents run on the host machine and
keep working after the browser closes.

---

## Status — Phase II (Agent runtime)

Working today:

- Operator account with first-run initialization, login, sessions
- Projects CRUD
- Entities (agents) CRUD with hierarchy (`parent_id`), tools and permissions
- Provider configuration with API keys encrypted at rest (never sent to the browser)
- **Agent runtime**: START / STOP / RESTART per entity, real status lifecycle
  (IDLE → THINKING → WORKING → ERROR), per-entity instruction queue
- **DeepSeek adapter** — streaming chat over the OpenAI-compatible API
- **Claude Code adapter** — launches the host `claude` CLI headlessly in the
  entity's working directory; stream-json output becomes real activity
  (assistant text, tool calls, raw output); sessions resume via `--resume`;
  entity permissions map to `--allowedTools` / `--disallowedTools`
  (`ask` resolves to auto-deny headlessly until the Phase VII approval system)
- Persistent conversations with streamed replies, tool rows and errors
- Runtime session history with token usage
- Real provider connection tests (DeepSeek HTTP check, Claude CLI check)
- **Model dropdowns** — provider and entity forms pick models from a list:
  fetched live from the provider where supported (DeepSeek `GET /models`,
  with a ⟳ refresh) or from a curated catalog (Claude family: Opus 5 /
  Sonnet 5 / Haiku 4.5 / Fable 5.1); the currently configured model is
  always kept, and CUSTOM… accepts ids outside the list
- Global activity log (events) + command dashboard + EREBUS dark visual system

Planned next: **Phase III — realtime** (WebSockets, live activity streams —
the UI currently polls while an entity is active), then **Phase IV — tasks**.

### Permissions note (Claude Code)

Filesystem/git/terminal `allow` → explicit CLI tool grants; `readonly` →
read-shaped grants; `deny` → explicit CLI deny rules; `ask` → auto-denied
in headless runs (there is no one to ask yet — the approval system is
Phase VII). Writes outside the entity's working directory require approval
and are therefore denied headlessly.

---

## Requirements

- Windows 10/11 (macOS/Linux should work; Windows is the primary target)
- Node.js 20+ (tested on 22)

## Installation

```bash
git clone <this repo>
cd EREBUS
npm install
npm run setup     # prepares the data directory and encryption keys
npm run dev
```

Open `http://127.0.0.1:4521` and follow the initialization screen:
operator account → first project → optional provider key → ARCHON is created.

## LAN access

```bash
npm run dev -- --host 0.0.0.0
```

Then from another device on your network:
`http://<DESKTOP-IP>:4521`

Keep the server bound to `127.0.0.1` on untrusted networks. LAN access is
unencrypted HTTP by design; the operator password and session cookie are the
access gate. Phase VII hardens this further.

## Configuration

Copy `.env.example` to `.env` or set variables in your shell:

| Variable | Default | Meaning |
|---|---|---|
| `EREBUS_DATA_DIR` | `./data` | SQLite database + secret keys |
| `NITRO_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` for LAN) |
| `NITRO_PORT` | `4521` | Server port |

## Providers

Settings → Providers. Keys are AES-256-GCM encrypted with a master key
generated into the data directory on first run. The UI only ever sees a
masked hint (`••••1234`). TEST performs a real connectivity check:
a live DeepSeek request, or a Claude CLI version check.

## Running entities

Open an entity → START → send an instruction. With a Claude provider the
entity launches `claude -p` in its working directory (requires the Claude
Code CLI installed and authenticated on the host). With DeepSeek the
entity runs a streaming chat loop in-process. All output is real: tool
rows, command output, errors and streamed replies land in the conversation
as they happen.

## Projects

A project binds entities to a root directory. Create one per codebase.
Entities can be assigned to a project and parented under another entity
(ARCHON → VESPER, …). Parent cycles are rejected.

## OneDrive warning

This default location sits inside OneDrive. The SQLite database is a
live-changing file — exclude `data/` from OneDrive sync (right-click → “Free
up space”/always-keep setting, or move `EREBUS_DATA_DIR` to a non-synced
location such as `C:\erebus-data`). Agent runtimes writing into synced
project directories in Phase II will also benefit from excluded folders.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` + `npm run preview` | Production build (one process) |
| `npm run typecheck` | vue-tsc full-project type check |
| `npm run smoke` | End-to-end API test (requires running server + fresh data) |

## Troubleshooting

- **`better-sqlite3` fails to load** — its native binding was not built:
  `npm install-scripts approve better-sqlite3 && npm rebuild better-sqlite3`.
  The approval is recorded in `package.json` for future installs.
- **Port in use** — `NITRO_PORT=4522 npm run dev`.
- **Reset everything** — stop the server, delete `data/`, run `npm run dev`
  again for a fresh initialization screen.
- **npm crashes with `edgesOut`** — upgrade npm (`npm install -g npm@latest`);
  npm 10.8.x had an arborist bug.

---

*An ancient intelligence buried inside a futuristic machine.*
