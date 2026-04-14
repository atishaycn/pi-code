# Provider and pi integration

## Current provider reality

Contracts mention multiple providers. Live integrated path is pi-backed Codex-style adapter.

Main files:

- [`apps/server/src/provider/Layers/PiCodexAdapter.ts`](../apps/server/src/provider/Layers/PiCodexAdapter.ts)
- [`apps/server/src/provider/Layers/ProviderService.ts`](../apps/server/src/provider/Layers/ProviderService.ts)
- [`apps/server/src/provider/pi/PiRpc.ts`](../apps/server/src/provider/pi/PiRpc.ts)
- [`packages/contracts/src/provider.ts`](../packages/contracts/src/provider.ts)
- [`packages/contracts/src/providerRuntime.ts`](../packages/contracts/src/providerRuntime.ts)

## Why names still say codex

Repo started from Codex/T3 Code integration shape. Pi adapter fits into existing provider surface by implementing Codex-like provider contract.

Meaning:

- many types still use `codex` provider label
- `PiCodexAdapter` is expected, not a bug
- upstream-compatible contract naming remains useful for parity work

## Provider service responsibilities

`ProviderService` is cross-provider layer.

Main jobs:

- validate operation inputs with shared schemas
- list available providers from registry
- route thread operations to correct adapter
- recover session from persisted binding when adapter process is gone
- track runtime binding metadata in session directory
- publish canonical provider runtime event stream
- record analytics and metrics around provider operations

## Session recovery model

Key idea: thread-to-provider binding is persisted even if live subprocess is gone.

Recovery logic:

1. look up persisted binding by thread ID
2. ask adapter if live session already exists
3. if live session exists, adopt it
4. else if binding has resume cursor, restart session with persisted cwd/model/resume state
5. rewrite binding with current session metadata

Why important:

- reconnect/restart behavior depends on binding persistence, not only in-memory sessions
- bugs after restart often live in binding payload shape or resume cursor handling

## pi adapter model

`PiCodexAdapter` wraps a `PiRpcProcess`.

### Session state tracked in adapter

Per thread:

- cwd
- session file path
- runtime mode
- model label
- thinking level
- active turn state
- tool lifecycle states
- buffered assistant text by item ID
- buffered reasoning text by item ID
- pending user-input request map

### Resume persistence

Adapter persists `resumeCursor` as session file path.

Session files live under server base dir in `pi-sessions/` by default.

### pi launcher config

Adapter resolves launcher path and env from server settings.

Settings matter:

- launcher binary path
- optional pi home path
- autoreason toggle
- full-autonomy toggle (`--full-autonomy` passed at process start)
- telemetry disabled for embedded runs

## pi event mapping

Adapter receives pi RPC events and emits canonical `ProviderRuntimeEvent` values.

### Example mappings

- pi assistant text / thinking -> `content.delta`
- pi tool start/update/end -> `item.started` / `item.updated` / `item.completed`
- pi user prompt widgets -> `user-input.requested`
- resolved user input -> `user-input.resolved`
- compaction -> `thread.state.changed` or warning
- retry -> warning/error
- turn start/end -> `turn.started` / `turn.completed`
- process exit -> `session.exited`

This mapping is crucial. UI never reads raw pi RPC event schema.

## Assistant text handling

Adapter keeps assistant text per item ID.

Behavior:

- pi message update streams deltas
- adapter computes delta from previous full text snapshot
- canonical runtime event carries only delta
- ingestion later decides whether UI gets streaming or buffered effect based on server settings

So there are two layers of buffering:

1. adapter converting full snapshots into deltas
2. ingestion optionally buffering assistant deltas before message completion

## Reasoning / thinking handling

Similar to assistant text:

- adapter tracks prior reasoning text per item ID
- emits `content.delta` with `reasoning_text`
- ingestion turns those into thread activities, not assistant messages

## Tool lifecycle handling

Adapter maps pi tool names into normalized item types:

- `bash` -> command execution
- `edit`/`write` -> file change
- read/find/grep/ls/default -> MCP tool call
- image view / web search specific types where available

Tool lifecycle events become thread activities downstream.

## User input handling

pi can request structured UI interaction.

Adapter supports request kinds:

- confirm
- select
- input
- editor

Flow:

1. adapter records pending request locally
2. emits `user-input.requested`
3. UI submits answers through server RPC
4. adapter sends extension UI response back to pi
5. adapter emits `user-input.resolved`

Approval requests are different. Current pi adapter does **not** support provider approval flow the same way codex app-server path did.

## Runtime controls exposed to UI

Server exposes a small runtime controller backed by active pi sessions.

UI-accessible operations via `ws.ts`:

- get thread runtime state
- get session stats
- update steering mode
- update follow-up mode
- toggle auto-compaction
- set session name
- force compaction

Used by settings/runtime surfaces in web UI.

## Runtime mode behavior

Contracts define:

- `full-access`
- `approval-required`

Current pi path mainly uses runtime mode as thread/session metadata and upstream-compatible control surface. Real approval flow support differs by provider path.

## Full autonomy setting

Pi Code exposes provider setting `providers.codex.fullAutonomy`.

Behavior:

- when enabled, embedded pi sessions start with `--full-autonomy`
- this is additive on top of pi's stronger default completion prompt behavior
- applies only to newly started embedded sessions because it is a process launch flag
- roadmap dashboard terminal launcher also uses `--full-autonomy` for explicit end-to-end execution runs

## Important source edges

### When changing provider contract shape

Read all:

- `packages/contracts/src/provider.ts`
- `packages/contracts/src/providerRuntime.ts`
- `apps/server/src/provider/Services/ProviderAdapter.ts`
- `apps/server/src/provider/Layers/ProviderService.ts`
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- `apps/web/src/providerModels.ts`

### When changing pi runtime behavior

Read all:

- `apps/server/src/provider/pi/PiRpc.ts`
- `apps/server/src/provider/Layers/PiCodexAdapter.ts`
- `apps/server/src/ws.ts`
- related web runtime/settings panels

## Known constraints and sharp edges

- provider labels and class names still reflect codex-first heritage
- rollback conversation is not supported for pi-backed threads in adapter itself
- many reconnect/recovery bugs will come from persisted binding payload shape
- user-input support exists, approval-request parity is different
- text delta ordering matters; do not casually rewrite buffering logic without checking ingestion/store semantics

## Good debug path for provider issues

### Session fails to start

Check:

1. server settings provider config
2. `resolvePiLauncherPath` / launcher env
3. pi session file path and cwd
4. adapter `startSession`

### Turn starts but no reply appears

Check:

1. adapter `sendTurn`
2. pi event callback path
3. `content.delta` emission
4. provider runtime ingestion assistant delta path
5. web store reducer for `thread.message-sent`

### User input panel appears but submit fails

Check:

1. adapter pending request map shape
2. `respondToUserInput`
3. request/question IDs in emitted event payload
4. UI form key path

### Session disappears after restart

Check:

1. persisted binding in provider session directory repository
2. stored `resumeCursor.sessionFile`
3. `recoverSessionForThread` in `ProviderService`
4. adapter `hasSession` / `startSession`
