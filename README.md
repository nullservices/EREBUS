<div align="center">

```
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║                        E  R  E  B  U  S                                  ║
║                                                                          ║
║        LOCAL AUTONOMOUS AI AGENT COMMAND PLATFORM                        ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

*An ancient intelligence buried inside a futuristic machine.*

`Windows` · `Node 22` · `Nuxt 4` · `SQLite` · `Phase II`

</div>

---

EREBUS is a **self-hosted, LAN-accessible orchestration environment for AI
agents**. It runs on your Windows desktop, gives entities (agents) access to
local projects and tools, and presents the whole operation as a dark,
restrained command console — observable from any device on your network.

The browser is a control surface. **The agents run on the host machine** and
keep working after the browser closes.

```
┌─────────────────────────┐          ┌──────────────────────────────┐
│  DESKTOP (host)         │          │  LAPTOP / PHONE (observe)   │
│                         │   LAN    │                              │
│  ┌───────────────────┐  │ ───────▶ │  http://DESKTOP-IP:4521     │
│  │ EREBUS server     │  │          │                              │
│  │ ┌─────┐ ┌─────┐   │  │          │  entities · tasks · activity │
│  │ │ARCHON│ │VESPER│  │  │          └──────────────────────────────┘
│  │ └─────┘ └─────┘   │  │
│  │ agent runtimes    │  │
│  │ SQLite · processes│  │
│  └───────────────────┘  │
└─────────────────────────┘
```

---

## Status — Phase II · Agent runtime

| | |
|---|---|
| ✅ Operator account, sessions, first-run initialization | ✅ Entity runtime: START / STOP / RESTART |
| ✅ Projects · entities · hierarchy · tools · permissions | ✅ DeepSeek adapter — streaming API runs |
| ✅ Providers with **encrypted** API keys | ✅ Claude Code adapter — headless CLI runs |
| ✅ Persistent conversations with streamed replies | ✅ Runtime sessions + token usage |
| ✅ Global activity log · command dashboard | ✅ Real provider connection tests |
| ✅ **Model dropdowns** — live from provider or curated | ✅ **Notification channels** — Discord · ntfy · webhooks |
| ⬜ Realtime WebSockets (Phase III) | ⬜ Task system + board (Phase IV) |
| ⬜ Orchestration & agent-to-agent (Phase V) | ⬜ Approval system (Phase VII) |

Entities show `OFFLINE` until their runtime is started — every status,
streamed word, tool row and error comes from the actual runtime. Nothing is
fabricated.

---

## Requirements

| Requirement | Note |
|---|---|
| Windows 10 / 11 | primary target (macOS/Linux should work) |
| Node.js 20+ | tested on 22 |
| Claude Code CLI | only for Claude-provider entities — and it's already on this machine |

## Installation

```bash
git clone <this repo>
cd EREBUS
npm install
npm run setup     # prepares data directory + encryption keys
npm run dev
```

Open `http://127.0.0.1:4521` → initialization screen → operator account →
first project → optional provider key → **ARCHON is created**.

## LAN access

```bash
npm run dev -- --host 0.0.0.0
```

Then from any device on your network: `http://<DESKTOP-IP>:4521`

> Keep the server bound to `127.0.0.1` on untrusted networks. LAN access is
> plain HTTP by design — the operator password and session cookie are the
> gate. Phase VII hardens this further.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `EREBUS_DATA_DIR` | `./data` | SQLite database + secret keys |
| `NITRO_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` for LAN) |
| `NITRO_PORT` | `4521` | Server port |

See `.env.example`.

## Providers & models

Settings → Providers. Keys are **AES-256-GCM encrypted** with a master key
generated into the data directory on first run — the UI only ever sees a
masked hint (`••••1234`). The model field is a dropdown:

- **LIVE FROM PROVIDER** — fetched from the provider's API (DeepSeek
  `GET /models`), refreshable with `⟳`
- **CURATED CATALOG** — for providers without a models endpoint (Claude:
  Opus 5 · Sonnet 5 · Haiku 4.5 · Fable 5.1)
- `CUSTOM…` — any model id outside the list

`TEST` performs a real connectivity check (live API request, or Claude CLI
version check).

## Running entities

Open an entity → **START** → send an instruction.

- **Claude provider** — launches `claude -p` headlessly in the entity's
  working directory; stream-json output becomes real activity (assistant
  text, tool calls, raw output); sessions resume with `--resume`.
- **DeepSeek provider** — streaming chat loop in-process.

### Permissions (Claude Code)

| Entity setting | Runtime behavior |
|---|---|
| `allow` | explicit CLI grant (`--allowedTools`) |
| `readonly` | read-shaped grants (`Read`, `git status/diff/log/…`) |
| `deny` | explicit CLI deny rule (`--disallowedTools`) |
| `ask` | auto-denied headlessly — the Phase VII approval system makes `ask` real |

Writes outside the entity's working directory always require approval →
denied headlessly.

## Notification channels

Settings → Notification Channels. EREBUS fans real events out of the global
activity log to every enabled channel that subscribed to the category.

| Kind | What it is | Setup |
|---|---|---|
| **Discord** | server webhook — no bot required | Channel settings → Integrations → Webhook |
| **ntfy** | push to your phone (self-hostable) | Install the ntfy app, subscribe to a topic |
| **Generic** | any HTTP endpoint (Slack, Telegram bridges…) | URL that accepts JSON |

Categories: `ERRORS` · `COMPLETIONS` · `LIFECYCLE` · `MESSAGES`. Channel
configs are encrypted like API keys; `TEST` sends a real delivery.

## OneDrive warning

This default location sits inside OneDrive. The SQLite database is a
live-changing file — **exclude `data/` from OneDrive sync** (or point
`EREBUS_DATA_DIR` at a non-synced location such as `C:\erebus-data`).
Agent working directories will benefit from the same treatment.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` + `npm run preview` | Production build (single process) |
| `npm run typecheck` | vue-tsc full-project type check |
| `npm run smoke` | End-to-end API suite (running server + fresh data) |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `better-sqlite3` fails to load | `npm install-scripts approve better-sqlite3 && npm rebuild better-sqlite3` |
| Port in use | `NITRO_PORT=4522 npm run dev` |
| Reset everything | stop server, delete `data/`, run again → fresh initialization |
| npm crashes with `edgesOut` | `npm install -g npm@latest` (npm 10.8.x arborist bug) |
| `claude CLI not found on PATH` | it's found automatically — native installs at `%USERPROFILE%\.local\bin\claude.exe`, npm shims via cmd.exe |

---

<div align="center">

```
PHASE I ▸ FOUNDATION       COMPLETE
PHASE II ▸ AGENT RUNTIME   COMPLETE
PHASE III ▸ REALTIME       NEXT
```

*Built for one machine. Commanded from anywhere in the house.*

</div>
