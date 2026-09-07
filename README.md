<div align="center">

```
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║                        E  R  E  B  U  S                                  ║
║                                                                          ║
║          LOCAL AUTONOMOUS AI AGENT COMMAND PLATFORM                      ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

**A self-hosted command platform for a private AI development workforce.**

![Windows](https://img.shields.io/badge/windows-10%2F11-blue)
![Node](https://img.shields.io/badge/node-22+-green)
![Nuxt](https://img.shields.io/badge/nuxt-4-00DC82)
![SQLite](https://img.shields.io/badge/sqlite-WAL-003B57)
![Smoke](https://img.shields.io/badge/smoke-110%2F110-darkgreen)

*An ancient intelligence buried inside a futuristic machine.*

</div>

---

## Table of contents

1. [What is EREBUS](#what-is-erebus)
2. [Features](#features)
3. [How it works](#how-it-works)
4. [Requirements](#requirements)
5. [Quickstart](#quickstart)
6. [LAN access](#lan-access)
7. [Configuration](#configuration)
8. [Providers](#providers)
9. [Entities & permissions](#entities--permissions)
10. [Tasks & orchestration](#tasks--orchestration)
11. [Realtime & notifications](#realtime--notifications)
12. [Security model](#security-model)
13. [API overview](#api-overview)
14. [Project structure](#project-structure)
15. [Development](#development)
16. [Troubleshooting](#troubleshooting)
17. [Roadmap](#roadmap)

---

## What is EREBUS

EREBUS is a **local-first, LAN-accessible orchestration environment for AI
agents**. It runs on a single Windows machine — the one with your files, git
repositories and development tools — and gives you a team of named entities
(agents) that work on real projects with real tools.

The browser is a control surface. **The agents run on the host machine** and
keep working after the browser closes. You can watch them work from any
device on your network, send instructions, answer their questions, approve
dangerous operations, and coordinate them as a team.

- No cloud backend. No accounts. No SaaS.
- One process, one port, one SQLite database.
- Every status, streamed word, tool call and error in the UI comes from the
  actual runtime. Nothing is simulated.

## Features

| | | |
|---|---|---|
| **Entity runtime** | start / stop / restart, instruction queues, session history, token usage | real status lifecycle: `IDLE → THINKING → WORKING → ERROR` |
| **Providers** | DeepSeek (streaming API + tool-calling loop) | Claude Code (headless CLI, session resume, MCP bridge) |
| **Tasks** | kanban board with drag-and-drop, hierarchy, dependencies, priorities | nine lifecycle statuses, entity assignment |
| **Orchestration** | agents delegate via `@ENTITY instruction` | agents ask the operator via `@OPERATOR question` |
| **Human intervention** | agents pause at `WAITING_FOR_HUMAN` | answers are injected back into their context |
| **Tools** | filesystem · git · terminal · protocol tools | permission gate on every call |
| **Approvals** | `allow` · `auto` · `ask` · `readonly` · `deny` per tool per entity | `auto` = ask only for destructive operations |
| **Realtime** | WebSocket push for every event and status change | live conversations, live board, live activity |
| **Notifications** | Discord webhooks · ntfy.sh push · generic webhooks | per-channel event categories, real test delivery |
| **Security** | encrypted API keys at rest, cookie sessions, login throttling | command deny-patterns, security headers |
| **Observability** | global activity feed, structured JSONL logs, search | Ctrl+K command palette, toast notifications |

## How it works

```
┌────────────────────────────┐          ┌───────────────────────────────┐
│  HOST (Windows)            │          │  ANY DEVICE ON YOUR LAN       │
│                            │   LAN    │                               │
│  ┌──────────────────────┐  │ ───────▶ │  http://HOST:4521             │
│  │ EREBUS server        │  │          │                               │
│  │ (Nuxt + Nitro)       │  │          │  entities · tasks · activity  │
│  │ ┌──────┐  ┌──────┐   │  │          │  approvals · interventions    │
│  │ │ARCHON│  │VESPER│…  │  │          └───────────────────────────────┘
│  │ └──────┘  └──────┘   │  │
│  │ agent runtimes       │  │
│  │ SQLite · processes   │  │
│  │ tools · permissions  │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

Each entity is configured independently — provider, model, working
directory, tools, permissions, parent entity. ARCHON (the default
orchestrator) decomposes objectives, delegates to developers, and coordinates
QA through the task board and the communication protocol.

## Requirements

| Requirement | Note |
|---|---|
| Windows 10 / 11 | primary target; macOS/Linux should work but are untested |
| Node.js 20+ | tested on 22 |
| Claude Code CLI | only for entities using the Claude provider (installed + authenticated on the host) |
| A DeepSeek API key | only for entities using the DeepSeek provider |

## Quickstart

```bash
git clone <repo-url>
cd EREBUS
npm install
npm run setup     # prepares the data directory + encryption keys
npm run dev
```

Open `http://127.0.0.1:4521`. The initialization screen creates the operator
account, an optional first project, and seeds ARCHON.

```
operator account → first project → optional provider key → ARCHON
```

## LAN access

```bash
npm run dev:lan
```

or, if you prefer the environment variable:

```bash
# PowerShell
$env:NITRO_HOST = "0.0.0.0"; npm run dev
```

Then from any device on your network: `http://<HOST-IP>:4521`

> npm 12 intercepts flags forwarded with `--` (`npm run dev -- --host …`
> fails), hence the dedicated `dev:lan` script and the env-var form.
> Keep the server bound to `127.0.0.1` on untrusted networks. LAN access is
> plain HTTP by design — see the [security model](#security-model).

## Configuration

Copy `.env.example` to `.env` or set variables in your shell:

| Variable | Default | Meaning |
|---|---|---|
| `EREBUS_DATA_DIR` | `./data` | SQLite database, secret keys, logs, generated bridges |
| `NITRO_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` for LAN) |
| `NITRO_PORT` | `4521` | Server port |

> If the data directory lives inside a cloud-synced folder (OneDrive,
> Dropbox), **exclude it from sync** — a live SQLite database does not
> tolerate sync conflicts. A non-synced location (e.g. `C:\erebus-data`)
> is recommended for agent-heavy use.

## Providers

Settings → Providers. Keys are **AES-256-GCM encrypted** with a master key
generated into the data directory on first run — the browser only ever sees
a masked hint (`••••1234`). `TEST` performs a real connectivity check.

- **Claude** — drives the host's `claude` CLI headlessly in the entity's
  working directory; `stream-json` output becomes real activity (assistant
  text, tool calls, raw output); sessions resume with `--resume`; EREBUS
  protocol tools reach the CLI through a generated MCP bridge.
- **DeepSeek** — OpenAI-compatible API with a full tool-calling loop:
  the model's tool calls are executed through EREBUS's permission-gated
  tool manager and results are fed back, bounded turns.
- **OpenAI / Gemini / custom** — configuration exists; runtime adapters
  follow the same interface (see [Roadmap](#roadmap)).

Model selection uses dropdowns fed by a **live** model list where the
provider exposes one (DeepSeek `GET /models`) or a **curated catalog**
otherwise (Claude family). `CUSTOM…` accepts any model id.

## Entities & permissions

An entity has a name, role, system prompt, provider, model override,
project, working directory, parent entity, tools and permissions.

Tools: `filesystem` · `git` · `terminal` · `network` · `mcp` (EREBUS
protocol tools: entities, tasks, messaging, operator questions).

| Level | Behavior |
|---|---|
| `allow` | runs directly |
| `auto` | safe operations run; **destructive operations ask** |
| `ask` | every invocation asks the operator |
| `readonly` | read-shaped operations only (reads, `git status/diff/log/…`) |
| `deny` | refused |

Approval requests pause the entity (`WAITING_FOR_HUMAN`), surface as a
banner in the UI, and resume with your answer. Terminal commands are
additionally checked against the operator-maintained regex deny list
(Settings → Command Restrictions). Filesystem tools are confined to the
entity's working directory.

## Tasks & orchestration

The task board (five columns, drag-and-drop) is the shared coordination
surface. ARCHON-style orchestration is expressed through the communication
protocol, which EREBUS parses from real agent output — line-anchored:

```
@VESPER implement the inventory backend
@OPERATOR which approach should we use?
```

- `@ENTITY instruction` — recorded in the target's conversation and queued
  to its runtime when started
- `@OPERATOR question` — the entity pauses; your answer is injected into
  its history and its queue resumes

The same protocol is available to agents as first-class tools
(`send_message`, `ask_operator`, `task_create`, `task_update`, `task_list`,
`list_entities`), so orchestration works through DeepSeek function calling
and through Claude Code's MCP tools alike.

## Realtime & notifications

Every recorded event and status change is pushed over an authenticated
WebSocket; the UI updates without refreshing (with a slow polling fallback
while the socket is down). The same event stream fans out to notification
channels:

| Kind | What it is | Setup |
|---|---|---|
| **Discord** | server webhook — no bot required | channel settings → integrations → webhook |
| **ntfy** | push to your phone, self-hostable | install the ntfy app, subscribe to a topic |
| **Generic** | any HTTP endpoint (Slack, Telegram bridges…) | URL that accepts JSON |

Each channel subscribes to event categories (`errors`, `completions`,
`lifecycle`, `messages`); configs are encrypted like API keys and `TEST`
sends a real delivery. Delivery is coalesced per category so bursts never
spam you — and errors are never suppressed by quieter traffic.

## Security model

EREBUS is designed for a **trusted home LAN**, not the open internet. Its
posture, honestly stated:

- **Authentication** — single operator account, bcrypt-hashed, HttpOnly
  cookie sessions (30 days), first-run initialization is one-shot
- **Throttling** — five failed logins lock a username out for a minute
- **Secrets** — provider keys and channel configs are AES-256-GCM encrypted
  at rest; keys never reach the browser or the event log
- **Execution** — every tool call passes the permission gate; destructive
  operations can require explicit approval; terminal commands are
  pattern-checked before execution
- **Transport** — plain HTTP on the LAN by design. Do not expose the port
  to the internet. Reverse-proxy TLS (Caddy/nginx) is the upgrade path if
  remote access is ever needed
- **Headless Claude Code** — `ask`/`auto` map to auto-deny in headless CLI
  runs (there is no one to ask mid-run); EREBUS-side approvals apply to the
  protocol tools via the MCP bridge

## API overview

All endpoints live under `/api` and require the session cookie (except
`/api/status`). Realtime: `ws://HOST:4521/live` (cookie or `?token=`).

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/setup` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/password` |
| Projects | `GET/POST /projects` · `GET/PATCH/DELETE /projects/:id` |
| Entities | `GET/POST /agents` · `GET/PATCH/DELETE /agents/:id` · `POST /agents/:id/start|stop|restart` |
| Conversations | `GET/POST /agents/:id/messages` · `GET /agents/:id/sessions` · `GET /agents/:id/tasks` |
| Tasks | `GET/POST /tasks` · `GET/PATCH/DELETE /tasks/:id` |
| Providers | `GET/POST /providers` · `GET/PATCH/DELETE /providers/:id` · `GET /providers/:id/models` · `POST /providers/:id/test` |
| Channels | `GET/POST /channels` · `PATCH/DELETE /channels/:id` · `POST /channels/:id/test` |
| Interventions | `GET /interventions` · `PATCH /interventions/:id` · `POST /agents/:id/interventions` |
| Events & system | `GET /events` · `GET /dashboard` · `GET /search` · `GET /system/info|security|logs` |

## Project structure

```
EREBUS/
├── app/              Vue client — pages, components, composables
├── server/           Nitro server
│   ├── api/          REST handlers (route files)
│   ├── runtime/      agent runner, process manager, provider adapters,
│   │                 tool manager, notifications, realtime, security
│   ├── db/           SQLite connection + versioned migrations
│   ├── utils/        auth, crypto, events, models, directives
│   └── plugins/      websocket policy, recovery, security headers
├── shared/           type contracts shared by client and server
├── scripts/          setup.mjs · smoke.mjs (end-to-end test suite)
└── data/             created at runtime — SQLite, keys, logs (gitignored)
```

## Development

```bash
npm run dev         # development server (hot reload)
npm run typecheck   # vue-tsc full-project type check
npm run build       # production build (single process)
npm run preview     # serve the production build
npm run smoke       # end-to-end suite (fresh data + running server)
```

The smoke suite exercises 110 checks across every subsystem: auth, runtime
lifecycle, realtime websockets, tasks, orchestration, interventions, the
tool gate (including a live approval round-trip), notifications with a real
HTTP receiver, security and search. Run it against a separate instance so
your data is never touched:

```bash
npm run build
# fresh data dir + isolated port:
$env:EREBUS_DATA_DIR="./data-smoke"; $env:NITRO_PORT="4524"; node .output/server/index.mjs
EREBUS_URL=http://127.0.0.1:4524 node scripts/smoke.mjs
```

Adding a provider means implementing one adapter interface and registering
it; adding a tool means one entry in the tool registry. Both surfaces were
built so integrations are additions, not rewrites.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `better-sqlite3` fails to load | `npm install-scripts approve better-sqlite3 && npm rebuild better-sqlite3` (approval is recorded in package.json) |
| Port in use | `NITRO_PORT=4522 npm run dev` |
| `claude CLI not found on PATH` | automatic resolution covers native installs (`%USERPROFILE%\.local\bin\claude.exe`) and npm shims; install the CLI and authenticate first |
| Entities stay `ERROR` | read the error row in the conversation — usually a provider key, CLI auth, or a denied tool |
| Forgot the operator password | `npm run reset-password` (keeps all data; signs out existing sessions) |
| Reset everything | stop the server, delete `data/`, run again → fresh initialization |
| npm crashes with `edgesOut` | `npm install -g npm@latest` (npm 10.8.x arborist bug) |

## Roadmap

Deliberately deferred, all pluggable through the existing registries:

- Local model adapters (Ollama, LM Studio)
- OpenAI / Gemini runtime adapters
- Discord bot transport, email notifications
- Per-agent notification routing and schedules
- Agent memory and vector stores, cost/token accounting
- Multi-machine workers, Docker sandboxes, containerized agents
- GitHub and CI integrations

---

<div align="center">

**Built for one machine. Commanded from anywhere in the house.**

</div>
