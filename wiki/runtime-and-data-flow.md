# Runtime and data flow

## End-to-end turn flow

High-level path for one user turn:

1. web UI creates orchestration command or provider send request
2. browser sends typed WebSocket RPC
3. server normalizes input and dispatches orchestration command / provider action
4. provider runtime emits canonical runtime events
5. `ProviderRuntimeIngestion` converts runtime events into orchestration updates
6. `OrchestrationEngine` persists events and updates projections
7. server streams domain events to client
8. web `store.ts` reduces domain events into UI state

## Browser transport flow

### Main browser pieces

- [`apps/web/src/nativeApi.ts`](../apps/web/src/nativeApi.ts): resolves current API implementation
- [`apps/web/src/wsNativeApi.ts`](../apps/web/src/wsNativeApi.ts): turns RPC transport into app-facing API
- [`apps/web/src/wsTransport.ts`](../apps/web/src/wsTransport.ts): transport state machine

### Important transport properties

- typed schema decode at boundary
- reconnect support
- request queueing while disconnected
- replay/latest push support for subscribers
- explicit connection state tracking

## RPC method flow

Server RPC methods live in [`apps/server/src/ws.ts`](../apps/server/src/ws.ts).

Important method families:

- orchestration snapshot/dispatch/replay/diff
- git operations
- terminal operations
- workspace search/write
- server settings/config/pi workspace/runtime
- subscriptions for orchestration, terminal, config, lifecycle

### Special command path

`dispatchCommand` does more than call engine directly.

Server path:

1. normalize command, including persisted uploaded attachments
2. if bootstrap work needed, create thread/worktree/setup script first
3. send final command through startup command gate
4. orchestration engine persists result

## Orchestration engine flow

Main file: [`apps/server/src/orchestration/Layers/OrchestrationEngine.ts`](../apps/server/src/orchestration/Layers/OrchestrationEngine.ts)

### Core loop

- incoming commands are wrapped in queue envelopes
- queue serializes command processing
- command receipts checked first for idempotency/rejection replay
- decider produces one or more event bases
- transaction appends events and projects them
- in-memory read model advances
- domain events publish to pubsub
- deferred result resolves with final sequence number

### Why this matters

State bugs often come from misunderstanding one of these facts:

- read model is in-memory but backed by persisted event/projection state
- projection pipeline runs as part of commit path
- duplicate command IDs can short-circuit to existing receipt
- async follow-up work happens after command acceptance, not always inside same request

## Provider runtime flow

Main service: [`apps/server/src/provider/Layers/ProviderService.ts`](../apps/server/src/provider/Layers/ProviderService.ts)

### What ProviderService does

- validate transport payloads against contracts
- resolve provider adapter by thread binding
- recover sessions from persisted binding when possible
- persist runtime binding and metadata
- publish canonical provider runtime event stream
- expose unified provider API to rest of server

### What adapter does

Adapter handles protocol details.

In main path, [`PiCodexAdapter`](../apps/server/src/provider/Layers/PiCodexAdapter.ts):

- starts pi RPC process
- maps pi events into canonical provider runtime events
- tracks active turn state, tool states, buffered text, pending user input
- holds `activeTurn` open through a short completion quiet window after `turn_end` / `agent_end`
- rebinds late assistant/tool events to same turn during that window instead of emitting detached post-completion activity
- exposes start/send/interrupt/respond/stop/list/has-session methods

## Provider runtime ingestion flow

Main file: [`apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`](../apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

### Job

Translate canonical provider runtime events into orchestration commands.

### Examples

- assistant text delta -> `thread.message.assistant.delta`
- assistant completion -> `thread.message.assistant.complete`
- session state change -> `thread.session.set`
- proposed plan delta/completion -> `thread.proposed-plan.upsert`
- tool/approval/user-input/runtime-warning events -> `thread.activity.append`
- turn diff update -> placeholder `thread.turn.diff.complete`

### Important internal state

Ingestion caches/buffers:

- assistant message IDs by turn
- buffered assistant text when streaming disabled
- buffered proposed plans
- pending source plan implementation tracking

This means state bugs may depend on event order, not just final events.

### Live-turn heartbeat + turn re-adoption

`ProviderRuntimeIngestion` now also treats live turn-scoped runtime events as heartbeat signals.

What this does:

- if same active turn is still producing runtime events (`content.delta`, `item.updated`, `runtime.warning`, etc.), ingestion refreshes `thread.session.updatedAt` with a new `thread.session.set`
- this keeps web runtime derivation from expiring a genuinely active turn just because no fresh lifecycle event arrived yet
- if provider session truth says a newer turn is active, and live runtime arrives for that turn, ingestion can re-adopt that turn into orchestration session state even before a fresh `turn.started` reaches web read model

Why this matters:

- fixes cases where provider logs clearly show ongoing work, but sidebar/chat lost `Working` because client running-heartbeat timestamps went stale
- fixes resumed/reopened work cases where runtime is active on newer turn but web read model was still anchored to older completed turn

## Checkpoint flow

Main file: [`apps/server/src/orchestration/Layers/CheckpointReactor.ts`](../apps/server/src/orchestration/Layers/CheckpointReactor.ts)

### Baseline capture

Before turn work, reactor ensures baseline git checkpoint exists for current turn count.

Triggers:

- domain `thread.turn-start-requested`
- domain `thread.message-sent` for user message bootstrap case
- runtime `turn.started`

### Completion capture

On turn completion or placeholder diff event:

1. resolve workspace cwd
2. capture git checkpoint ref
3. diff against previous checkpoint
4. dispatch `thread.turn.diff.complete`
5. publish receipts:
   - `checkpoint.diff.finalized`
   - `turn.processing.quiesced`
6. append activity `checkpoint.captured`

### Revert flow

For `thread.checkpoint.revert`:

1. locate target checkpoint ref
2. restore workspace state via checkpoint store
3. invalidate workspace cache
4. rollback provider conversation if needed
5. delete stale future checkpoint refs
6. dispatch `thread.revert.complete`

## Web state projection flow

Main file: [`apps/web/src/store.ts`](../apps/web/src/store.ts)

### Bootstrapping

- `syncServerReadModel` loads full orchestration snapshot into client store
- later `applyOrchestrationEvent(s)` incrementally updates store

### What store contains

- projects
- threads
- sidebar summaries by thread ID
- thread IDs by project ID
- bootstrap completion flag

### Chat timeline subagent rendering

Current chat timeline subagent UI is web-derived, not a dedicated server projection.

- `apps/web/src/session-logic.ts` now preserves `tool.started` entries for `collab_agent_tool_call` so delegation blocks can render as soon as invocation starts.
- `apps/web/src/subagentActivity.ts` parses provider tool payloads into normalized subagent shapes:
  - Pi `subagent` tool single / parallel / chain inputs
  - Claude Task-style delegated teammate inputs
  - textual result summaries like `✓ scout: ...`
- `apps/web/src/components/chat/MessagesTimeline.tsx` renders those parsed invocations as block cards inside the normal work-log row, including:
  - mode badge (`Single`, `Series`, `Parallel`)
  - per-step agent/task blocks
  - chain handoff labels when a later step uses `{previous}`
  - compact update rows beneath the block

### Important reducer behaviors

- assistant message deltas merge into message state
- session updates can create/reroute `latestTurn`
- diff summaries rebind to assistant message IDs
- revert prunes messages/proposed plans/activities/checkpoints
- editing an earlier user message in UI works by rewinding thread to checkpoint before that message, then sending edited text as the next turn in same thread
- sidebar summaries are derived and memo-ish updated only when changed

### Sidebar status diagnostics log

The web root now runs a thread-status diagnostics coordinator.

What it does:

- watches app store + UI store changes
- recomputes the same sidebar status decision used for thread pills
- writes one NDJSON record per thread change through server RPC
- stores logs under `${logsDirectoryPath}/thread-status/<thread-id>.ndjson`

Each record includes:

- previous snapshot and next snapshot
- status label transition (`Working`, `Completed`, etc.)
- decision reason (`actively-running`, `manual-complete`, `pending-approval`, etc.)
- manual completion override and `lastVisitedAt`
- latest turn + session fields
- previous / anchor / next message window
- recent activity summaries

Use this when sidebar state looks wrong but raw orchestration events look right. It shows which client-side inputs produced the visible sidebar status.

### Post-completion continuation handling

Thread status can stay `Working` briefly after a completed turn when fresh tool or assistant activity arrives after the first completion signal.

Current split of responsibility:

- server `PiCodexAdapter` delays final `turn.completed` for a short quiet period after `turn_end` / `agent_end`
- if late work arrives during that window, same provider turn stays active and events keep same turn binding
- web `session-logic.ts` still keeps a bounded continuation fallback window so UI remains correct if provider lifecycle finishes early or detached late activity slips through

Target visible behavior:

- show `Working` while real processing continues
- switch to `Completed` only after work actually goes quiet
- never show green `Completed` for interrupted / aborted turns
- web stop button now dispatches `thread.turn.interrupt` with current orchestration `turnId`, so optimistic UI interrupt handling matches pi TUI escape behavior more closely

## Desktop backend boot flow

Main file: [`apps/desktop/src/main.ts`](../apps/desktop/src/main.ts)

### Sequence

1. Electron resolves user data dir and app identity
2. picks loopback backend port
3. generates backend auth token
4. spawns bundled backend child with bootstrap pipe fd 3
5. child receives JSON bootstrap envelope
6. desktop preload exposes `getWsUrl()` and native helpers
7. renderer connects to authenticated loopback WebSocket URL

This makes desktop renderer mostly same as browser renderer, with different transport URL source.

### 2026-04 desktop startup collision bug

Bug shape:

- desktop app opened only one `server` project/thread instead of global workspace history
- persisted renderer-state bug existed, but deeper root cause was backend port collision during desktop startup

Actual failure mode:

- stray dev server from `bun run src/bin.ts` was still listening on `*:3773`
- desktop backend port probe only checked `127.0.0.1`
- macOS allowed desktop child to also bind `127.0.0.1:3773` while another process already held wildcard/IPv6 listener on same port
- renderer then connected to wrong server state and loaded snapshot from different T3 home (`~/.t3/dev/state.sqlite`), which only had one `server` project
- intended desktop state lived in `~/.pi-t3code/userdata/state.sqlite`

Fix:

- desktop port probe now treats port as unavailable unless it can bind all of:
  - `127.0.0.1`
  - `0.0.0.0`
  - `::`
- this avoids partial bind success and forces desktop backend onto clean port when wildcard or IPv6 listener already exists

Files:

- `apps/desktop/src/backendPort.ts`
- `apps/desktop/src/backendPort.test.ts`
- `apps/desktop/src/main.ts`

Debug pattern for future:

- if desktop shows only `server` project on startup, compare listeners with:
  - `lsof -nP -iTCP -sTCP:LISTEN | rg ':(3773|3774|3775|5733)'`
- inspect which DB each server is using
- if snapshot looks wrong, check for stray dev server on default desktop port before blaming renderer state

### 2026-04 desktop startup bootstrap race

Bug shape:

- desktop splash briefly showed `Cannot reach the T3 server`
- app then recovered seconds later
- sometimes renderer finished startup with empty projects/chats even though sqlite still had full desktop history

Actual failure mode:

- Electron window loaded before bundled backend finished listening
- renderer attempted WebSocket too early, hit transient connection failure, then retried
- orchestration bootstrap depended on lifecycle welcome path; if that path did not hydrate promptly after reconnect, UI could open with empty in-memory project state

Fix:

- desktop main now waits for backend HTTP readiness before creating the renderer window
- renderer also performs snapshot bootstrap proactively, not only from welcome handling

Files:

- `apps/desktop/src/backendReadiness.ts`
- `apps/desktop/src/main.ts`
- `apps/web/src/routes/__root.tsx`

## Persistence flow

### Event truth

Primary write path:

- orchestration events appended to event store
- command receipts stored for idempotency
- projections updated for read-side queries

### Session truth

Provider session binding is stored separately so thread/provider relationship can recover across restarts.

## Receipts and draining

Two patterns make tests deterministic:

### Drainable workers

Used for ingestion/reactor queues. `drain()` waits until queue empty and idle.

### Runtime receipts

Used to wait for meaningful async milestones instead of sleeps.

Common examples:

- baseline captured
- diff finalized
- turn processing quiesced

## Debug checklist by symptom

### User action accepted but UI never updates

Read:

1. `apps/server/src/ws.ts`
2. `apps/server/src/orchestration/Layers/OrchestrationEngine.ts`
3. `apps/web/src/store.ts`

### Provider event exists but thread state wrong

Read:

1. `apps/server/src/provider/Layers/PiCodexAdapter.ts`
2. `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
3. `apps/web/src/store.ts`

### Turn diff missing or revert broken

Read:

1. `apps/server/src/orchestration/Layers/CheckpointReactor.ts`
2. `apps/server/src/checkpointing/Utils.ts`
3. `apps/server/src/checkpointing/Layers/CheckpointStore.ts`
4. `apps/server/src/checkpointing/Layers/CheckpointDiffQuery.ts`

### Desktop works in dev but not packaged

Read:

1. `apps/desktop/src/main.ts`
2. `apps/desktop/src/staticDir.ts`
3. `docs/release.md`
4. `docs/observability.md`
