# Project overview

## What repo is

Pi Code is a monorepo for a coding-agent product.

Product mix:

- T3 Code UX shell and desktop packaging
- pi runtime integration for actual agent execution
- Codex-first contract naming still remains in many places
- some upstream T3 Code parity work still in progress

Main repo statement lives in [`README.md`](../README.md).

## Design priorities

From project instructions and code shape:

1. performance first
2. reliability first
3. predictable behavior under reconnects, restarts, and partial streams
4. maintainability over local hacks
5. event ordering and deterministic tests matter a lot

## Monorepo layout

### Apps

- [`apps/server`](../apps/server): backend service and CLI package `t3`
- [`apps/web`](../apps/web): browser UI
- [`apps/desktop`](../apps/desktop): Electron shell
- [`apps/marketing`](../apps/marketing): marketing/download site

### Packages

- [`packages/contracts`](../packages/contracts): Effect schemas, transport contracts, model types
- [`packages/shared`](../packages/shared): runtime helpers reused by server/web/desktop/scripts
- [`packages/client-runtime`](../packages/client-runtime): environment targeting/scoping helpers

### Tooling and docs

- [`scripts`](../scripts): dev runner, release helpers, automation, upstream sync
- [`docs`](../docs): product/runbook docs
- [`.docs`](../.docs): architecture summaries and repo notes
- [`.plans`](../.plans): planning docs and remediation tracks
- [`research`](../research): external reference material and imported research repos

## Product surfaces

### Web mode

Server serves built web app and exposes WebSocket RPC.

### Desktop mode

Electron starts backend child process, injects desktop bridge, loads web client in Electron window, and adds updater/restart/menu/native features.

### CLI/server package

`apps/server` also publishes CLI package `t3`.

## Main runtime concepts

### Project

Top-level workspace record. Maps to git repo or workspace root.

### Thread

Durable conversation unit. Holds messages, activities, checkpoints, session state, branch/worktree metadata, and latest turn state.

### Turn

One user-to-assistant work cycle.

### Orchestration

Event-sourced domain layer inside server. Commands become persisted events, then projection tables/read model, then WebSocket pushes.

### Provider runtime

Actual agent implementation. In this repo, pi-backed Codex adapter is main live path. Provider events are normalized before reaching UI.

### Checkpoint

Git snapshot per turn. Used for diff summaries and revert.

## Upstream relationship

Repo is hybrid of:

- upstream `t3code`
- upstream `pi-mono`

Important consequence:

- many names still say `codex` or `t3`
- some features are intentionally divergent
- sync from upstream uses manifest tracking, not overwrite

See [`docs/upstream-sync.md`](../docs/upstream-sync.md) and [`docs/t3code-feature-map.md`](../docs/t3code-feature-map.md).

## Important package facts

### `apps/server`

- framework: Effect
- transports: HTTP + WebSocket RPC
- persistence: SQLite + migration layer
- side effects: git, terminal PTY, provider runtime, browser open, telemetry
- orchestration core lives under [`apps/server/src/orchestration`](../apps/server/src/orchestration)

### `apps/web`

- framework: React 19 + Vite + TanStack Router + React Query + Zustand
- state split: orchestration mirror in Zustand, RPC transport state, query caches, local UI stores
- main visual complexity: chat timeline, composer, sidebar, terminal drawer, diff panels, settings

### `apps/desktop`

- framework: Electron
- job: package app, start backend, expose bridge, handle updates, native dialogs, native shell actions

### `packages/contracts`

- no business runtime logic
- shared schemas define transport and state boundaries
- best place to start when unsure about accepted payload shapes

### `packages/shared`

- tiny focused utilities
- notable helpers: `DrainableWorker`, model normalization, logging, shell helpers, server settings parsing, streaming message merge

## Key files to orient quickly

- [`apps/server/src/server.ts`](../apps/server/src/server.ts): server layer composition
- [`apps/server/src/ws.ts`](../apps/server/src/ws.ts): WebSocket RPC routes and method wiring
- [`apps/server/src/serverRuntimeStartup.ts`](../apps/server/src/serverRuntimeStartup.ts): startup sequencing and readiness gate
- [`apps/web/src/main.tsx`](../apps/web/src/main.tsx): web boot
- [`apps/web/src/router.ts`](../apps/web/src/router.ts): router and providers
- [`apps/web/src/store.ts`](../apps/web/src/store.ts): orchestration event -> UI state reducer
- [`apps/desktop/src/main.ts`](../apps/desktop/src/main.ts): desktop main process
- [`apps/desktop/src/preload.ts`](../apps/desktop/src/preload.ts): bridge into renderer

## Current known high-value areas

From docs and repo shape, these areas matter most when changing behavior:

- server orchestration ordering
- provider runtime normalization
- checkpointing and revert correctness
- reconnect-safe client transport
- desktop backend boot and update flow
- upstream parity gaps: auth, multi-environment support, command palette, some desktop hardening
