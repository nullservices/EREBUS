# EREBUS functional review — 2026-09-08

## Intended experience

A project is a persistent workspace with a lead agent conversation. The lead can create workers, each with its own visible chat, independent context, runtime, and status. The operator can inspect or speak to any worker. Worker results return to the lead, which continues coordinating the objective. Conversations survive navigation, browser closure, and application restart.

## Assessment

The repository contains a useful foundation: persisted per-agent messages, parent/child relationships, child creation/start/stop tools, provider adapters, a task board, interventions, and WebSocket events. The central delegation and conversation lifecycle are incomplete. Passing the existing smoke suite does not demonstrate autonomous team execution.

## Verification

- Ran the existing smoke suite against a fresh temporary database on localhost:4524 using installed Node 22: **130/130 passed**.
- Ran four additional API probes against that disposable instance. No real provider key was used and no paid model calls were required.
- Reviewed source paths from chat submission through runners, adapters, tools, messages, interventions, and realtime delivery.
- This review did not modify application behavior. It does not certify live Claude or DeepSeek execution, or all security boundaries.

## Confirmed defects

1. **P1 — Tool-based delegation never schedules the recipient.** `server/runtime/tools/execute.ts:255` inserts a message and returns “delivered” without calling `submitInstruction`. Reproduced with a started child: the tool reported success, its chat contained the instruction, and it remained IDLE with no reply or provider error. This also prevents tool-based worker reports from waking the lead. The separate text-directive path does submit work, so the two advertised mechanisms behave differently.

2. **P1 — Messages sent offline never execute on start.** `server/runtime/agent-runner.ts:86` creates an idle runner without replaying stored messages. Submission returns false when no runner exists; the composer ignores `queued`. Reproduced: send offline, start, observe one user message and IDLE. Queues are also in-memory and deleted on stop. Add durable execution state rather than replaying every historical message.

3. **P1 — Operator answers do not reach the active tool loop.** `server/runtime/tools/execute.ts:341` converts the response into a boolean and returns only “operator answered.” Reproduced with “Use TypeScript”: that text was absent from the tool result. Although saved to the database, the current DeepSeek request history is already in memory. For output-based questions, resolving an intervention resumes the queue but does not enqueue the answer as a new turn, so an otherwise empty queue has nothing to continue.

4. **P1 — Long chats stop displaying new messages.** `server/api/agents/[id]/messages.get.ts:18` defaults to the oldest 200 messages. The agent page never requests another page. Reproduced with 202 added messages: the default response stopped at an older message while the offset response contained the latest. Load the newest page first and provide older-history pagination.

5. **P2 — Text streaming is not pushed to the conversation.** `server/runtime/agent-runner.ts:59` appends text to SQLite, but the flush path emits no realtime update. The UI refreshes messages on event payloads and disables polling while connected. Plain-text replies therefore have no reliable incremental update until completion or another event. Add message-specific delta/update events, including final/error flushing.

6. **P2 — DeepSeek context and model settings are inconsistent.** The runner loads history including the submitted instruction; `server/runtime/providers/deepseek.ts:165` appends that instruction again. The adapter reads `config.model` rather than `options.model`, ignoring per-agent overrides. History takes only 30 text messages, excluding tool results and earlier context, without summarization. These source findings need provider-contract tests.

7. **P1 — Stop does not cancel permission waits or native tool work.** DeepSeek execution calls `executeToolCall` without an abort signal. Approval loops and terminal execution are independent of the runner abort controller; these terminal processes are not registered with the runner's process list. A stopped agent can still have a pending operation, including a write that executes if subsequently approved. The three-minute provider timeout also continues during a tool approval wait that allows fifteen minutes. Make cancellation propagate through waits, tools, and child processes before relying on Stop for team management.

## Structural gaps relative to the requested product

- **Projects do not own a main conversation.** Project creation saves metadata only. ARCHON is seeded during initial setup, not for each new project. Project selection filters sidebar agents; it does not navigate into a project workspace or consistently scope the task board and protocol tools.
- **Agent identity, conversation, and execution session are conflated.** Messages belong to an agent, not a conversation/session. Runtime sessions record start/stop metadata. There is no new-chat, archive-chat, conversation selection, or read-state model. Multiple agents have separate histories, but one agent cannot have independent chat sessions.
- **Restart does not preserve Claude context.** A start creates a new runtime session with no external session ID; resume looks only at that new row. The Claude adapter does not inject stored message history. The visible old conversation can survive while the underlying model begins a fresh session.
- **The parent relationship is not a coordination lifecycle.** Child completion logs an event but does not deliver a structured result to the parent or resume it. There is no durable delegation record, join/wait primitive, failed-child handling, or automatic aggregation. The prompt asks the model to coordinate, but the runtime must support that promise.
- **Workers share the same directory.** Child creation inherits the parent's working directory. There is no worktree isolation, file ownership, or merge coordination. Concurrent editing needs an explicit shared-workspace policy or isolated branches/worktrees.
- **Team chat affordances are missing.** Navigation is a flat entity list with project filtering, not project/lead/worker conversation groups. There are no unread counts, recent previews, persistent drafts, follow-latest behavior, or Markdown/code rendering. Tool results are not consistently represented in chat history.
- **Provider support is partial.** Only Claude and DeepSeek have runtime adapters; other provider configurations can exist without runnable implementations.

## Recommended implementation sequence

1. Repair the execution contract: durable instruction queue; one dispatch path for operator and agent messages; exact intervention answers; cancellation; live message updates; latest-history pagination. Add regression tests for the failures above.
2. Model `Project → Conversation → Run`, with a lead conversation for each project and worker conversations linked to their parent and delegated objective. Keep agent/provider configuration distinct from conversation state.
3. Implement delegation as a recorded operation: create worker conversation, start execution, stream progress, persist completion/failure, deliver result to the parent, and resume coordination. Record resource/concurrency limits and workspace policy.
4. Make the UI chat-first: expandable project groups, prominent lead chat, nested worker chats, unread/attention markers, composer and transcript as the main surface, task/tool details in a secondary panel. Preserve the EREBUS brand styling.
5. Verify the complete flow with deterministic provider fixtures, then separately with configured live providers: project creation → lead instruction → two child chats → concurrent work → operator intervention → child results → lead synthesis → server restart and continuation.

## Acceptance scenario

“Build authentication for this project” is sent to the project's lead chat. The lead creates implementation and review workers. Both chats appear immediately and expose actual tool activity. The operator can answer a worker question without losing either conversation. Worker completion or failure reaches the lead automatically. The lead reports the integrated result. Restarting EREBUS preserves the chats and accurately recovers or marks pending/interrupted work; no instruction silently disappears or executes twice.
