# Wiki index

Purpose: fast repo memory for agents. Source files still win.

## How to use this wiki

- Broad task: read this file first.
- Then read matching wiki page.
- Then open cited source files before changing code.
- If wiki and source disagree, trust source. Update wiki after fix.

## Project snapshot

Pi Code is T3 Code shell plus pi runtime integration.

Core shape:

- `apps/server`: Effect-based Node/Bun backend. Serves web app, hosts WebSocket RPC, owns orchestration, persistence, git, terminal, provider runtime, and checkpointing.
- `apps/web`: React/Vite client. Renders projects, threads, timeline, terminals, diffs, settings, and desktop-aware UX.
- `apps/desktop`: Electron shell. Starts bundled backend on loopback, exposes desktop bridge, handles updates and packaging.
- `packages/contracts`: shared schemas and RPC contracts.
- `packages/shared`: shared runtime helpers.
- `packages/client-runtime`: small environment-scoping helpers restored from upstream.
- `scripts`: automation, release, upstream sync, dev runner, validation helpers.

## Read paths by task

### Broad architecture / where code lives

1. [Project overview](./project-overview.md)
2. [Architecture](./architecture.md)
3. [Packages and entrypoints](./packages-and-entrypoints.md)

### Runtime bugs / event flow / state bugs

1. [Runtime and data flow](./runtime-and-data-flow.md)
2. [Architecture](./architecture.md)
3. [Glossary](./glossary.md)

### pi runtime / provider work

1. [Provider and pi integration](./provider-and-pi-integration.md)
2. `apps/server/src/provider/Layers/PiCodexAdapter.ts`
3. `apps/server/src/provider/Layers/ProviderService.ts`
4. `apps/server/src/ws.ts`

### Web UI / state / routes

1. [Packages and entrypoints](./packages-and-entrypoints.md)
2. `apps/web/src/store.ts`
3. `apps/web/src/wsNativeApi.ts`
4. `apps/web/src/components/`

### Desktop / packaging / updater

1. [Operations and release](./operations-and-release.md)
2. `apps/desktop/src/main.ts`
3. `apps/desktop/src/preload.ts`
4. `docs/release.md`

### Local dev / automation / validation

1. [Development workflows](./development-workflows.md)
2. [Testing and quality](./testing-and-quality.md)
3. `scripts/dev-runner.ts`
4. `docs/automation.md`

## Page map

- [Project overview](./project-overview.md)
- [Architecture](./architecture.md)
- [Packages and entrypoints](./packages-and-entrypoints.md)
- [Runtime and data flow](./runtime-and-data-flow.md)
- [Provider and pi integration](./provider-and-pi-integration.md)
- [Development workflows](./development-workflows.md)
- [Testing and quality](./testing-and-quality.md)
- [Operations and release](./operations-and-release.md)
- [Glossary](./glossary.md)
- [Change log](./log.md)

## High-signal facts

- Backend is event-sourced around orchestration commands/events, with projection tables for read state.
- Web app state is mostly a projected mirror of orchestration events plus local UI stores.
- Provider runtime events are normalized server-side before UI sees them.
- Checkpointing uses git refs per turn and emits receipts when diff/baseline work settles.
- Desktop app runs bundled backend as child process and connects over authenticated loopback WebSocket.
- Repo intentionally carries local divergence from upstream `t3code` and `pi-mono`; sync is manifest-based, not blind copy.

## Key source documents outside wiki

- [`README.md`](../README.md)
- [`AGENTS.md`](../AGENTS.md)
- [`.docs/architecture.md`](../.docs/architecture.md)
- [`.docs/provider-architecture.md`](../.docs/provider-architecture.md)
- [`docs/automation.md`](../docs/automation.md)
- [`docs/observability.md`](../docs/observability.md)
- [`docs/upstream-sync.md`](../docs/upstream-sync.md)
- [`docs/release.md`](../docs/release.md)
