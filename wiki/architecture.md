# Architecture

## Top-level shape

```text
Browser / Electron renderer
  -> WebSocket RPC + HTTP
Server (Effect app)
  -> provider adapters, orchestration, sqlite, git, PTY, observability
Provider runtime
  -> pi RPC process / provider-specific subprocesses
```

Reference source: [`apps/server/src/server.ts`](../apps/server/src/server.ts).

## Server composition

`server.ts` builds runtime in layers.

Main groups:

- HTTP server layer
- platform services (Bun or Node)
- persistence layer (`Sqlite` + migrations)
- provider layer (`ProviderService`, adapter registry, session directory)
- orchestration layer (`OrchestrationEngine`, reactors, receipts)
- git layer
- terminal layer
- workspace/project helpers
- observability layer
- route layer (HTTP + WebSocket)

Important detail: many services are effect layers, not singleton classes. Wiring order matters.

## Startup model

Startup sequencing lives in [`apps/server/src/serverRuntimeStartup.ts`](../apps/server/src/serverRuntimeStartup.ts).

Server uses a readiness gate before accepting real command work.

Flow:

1. start keybindings runtime
2. start server settings runtime
3. start orchestration reactors
4. prepare/publish welcome lifecycle event
5. signal command readiness
6. wait for HTTP listener
7. publish ready lifecycle event
8. record startup heartbeat
9. maybe open browser

Why this matters:

- RPC handlers can enqueue command work before full readiness
- readiness gate drains queued commands after startup finishes
- avoids races during boot

## Route surface

Routes are merged in `makeRoutesLayer`.

Main route families:

- attachments
- orchestration HTTP helpers
- project favicon route
- static/dev web app route
- OTLP traces proxy route
- WebSocket RPC route

Reference: [`apps/server/src/ws.ts`](../apps/server/src/ws.ts).

## WebSocket architecture

Transport model is Effect RPC over WebSocket.

Important groups:

- request/response RPC methods
- streaming RPC methods
- server lifecycle/config/event streams
- orchestration snapshot/replay/domain event methods

Backend RPC group is defined from shared contracts in [`packages/contracts/src/rpc.ts`](../packages/contracts/src/rpc.ts).

## Domain architecture: orchestration

Orchestration is core server domain.

Pieces:

- command validation and decision: `commandInvariants.ts`, `decider.ts`
- persisted event log: `OrchestrationEventStore`
- projection pipeline: projection tables and snapshot query
- read model in memory plus SQL-backed projections
- reactors for side effects after events/runtime signals

Main engine: [`apps/server/src/orchestration/Layers/OrchestrationEngine.ts`](../apps/server/src/orchestration/Layers/OrchestrationEngine.ts)

### Key properties

- commands serialize through queue
- events are persisted before they become truth
- projection pipeline updates read tables inside transaction path
- command receipts provide idempotency / repeat protection
- domain event pubsub fans out to subscribers

## Provider architecture

Provider layer is split in two:

1. generic cross-provider orchestration in `ProviderService`
2. provider-specific adapters in `provider/Layers/*Adapter.ts`

Main live provider path:

- `PiCodexAdapter` implements provider operations using pi RPC process
- adapter emits canonical `ProviderRuntimeEvent` stream
- `ProviderService` persists session binding and exposes unified API

Reference:

- [`apps/server/src/provider/Layers/ProviderService.ts`](../apps/server/src/provider/Layers/ProviderService.ts)
- [`apps/server/src/provider/Layers/PiCodexAdapter.ts`](../apps/server/src/provider/Layers/PiCodexAdapter.ts)

## Runtime ingestion architecture

Provider events are not sent raw to UI.

Server converts them through ingestion pipeline:

1. provider runtime event emitted
2. `ProviderRuntimeIngestion` maps event into orchestration commands/events
3. `OrchestrationEngine` persists and projects state
4. UI receives domain events and updates local store

Reference: [`apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`](../apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)

## Checkpointing architecture

Checkpointing is separate reactor path.

Responsibilities:

- capture pre-turn baselines
- capture turn-complete snapshots
- compute checkpoint diffs
- emit receipts when diff/baseline work settles
- handle revert requests

Reference: [`apps/server/src/orchestration/Layers/CheckpointReactor.ts`](../apps/server/src/orchestration/Layers/CheckpointReactor.ts)

## Persistence architecture

SQLite backing store plus migrations.

Core buckets:

- orchestration event log
- command receipts
- provider session runtime table
- projection tables for projects/threads/messages/activities/checkpoints/turns/etc.

Migration loader is static and ordered.

Reference: [`apps/server/src/persistence/Migrations.ts`](../apps/server/src/persistence/Migrations.ts)

## Web app architecture

Web app boot:

- `main.tsx` chooses browser vs hash history
- `router.ts` wires QueryClient + Atom registry
- `wsNativeApi.ts` builds typed browser-side API over WebSocket
- `store.ts` mirrors orchestration model into UI-friendly state

State layers:

- Zustand app store for projected orchestration state
- React Query for pull-style RPC/query helpers
- local stores for drafts, command palette, thread selection, UI state

## Desktop architecture

Electron main process does several jobs:

- choose local state dirs
- start bundled backend child process with bootstrap pipe
- inject auth token and backend port
- expose desktop bridge through preload
- host auto-update flow
- open terminal windows, external links, dialogs, menus
- package static client under custom `t3://` scheme

References:

- [`apps/desktop/src/main.ts`](../apps/desktop/src/main.ts)
- [`apps/desktop/src/preload.ts`](../apps/desktop/src/preload.ts)

## Reliability patterns repeated across repo

### Queue-backed workers

Used heavily for ordered async side effects.

Helper: [`packages/shared/src/DrainableWorker.ts`](../packages/shared/src/DrainableWorker.ts)

Why important:

- deterministic draining in tests
- avoid race-heavy fire-and-forget logic
- preserve event ordering better under load

### Event receipts

Async milestone bus lets code/tests wait for completion without polling.

Examples:

- checkpoint baseline captured
- checkpoint diff finalized
- turn processing quiesced

### Typed boundaries

Contracts package defines schemas at transport and persistence boundaries.

Best debugging move when shape unclear:

1. read contract schema
2. read server RPC handler
3. read web consumer

## Cross-cutting concerns

### Observability

- pretty logs to stdout
- NDJSON traces persisted locally
- optional OTLP traces/metrics export

See [`docs/observability.md`](../docs/observability.md).

### Upstream divergence

Architecture intentionally differs from upstream in provider/runtime areas. Do not assume upstream file can be copied over safely.

See [`docs/upstream-sync.md`](../docs/upstream-sync.md).
