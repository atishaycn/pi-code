# Packages and entrypoints

## Repo package map

| Path                      | Role                              | Main entrypoints                                     |
| ------------------------- | --------------------------------- | ---------------------------------------------------- |
| `apps/server`             | backend runtime and published CLI | `src/bin.ts`, `src/server.ts`, `src/ws.ts`           |
| `apps/web`                | React client                      | `src/main.tsx`, `src/router.ts`, `src/store.ts`      |
| `apps/desktop`            | Electron shell                    | `src/main.ts`, `src/preload.ts`                      |
| `apps/marketing`          | marketing/download site           | Astro app                                            |
| `packages/contracts`      | shared schemas and RPC contracts  | `src/index.ts`, `src/orchestration.ts`, `src/rpc.ts` |
| `packages/shared`         | shared runtime utilities          | explicit subpath exports                             |
| `packages/client-runtime` | environment targeting helpers     | `src/index.ts`                                       |
| `scripts`                 | automation and maintenance        | `dev-runner.ts`, `upstream-sync.ts`, etc.            |

## Repo-local pi resources

Repo carries project-local pi customizations under `.pi/`.

High-signal files/directories:

- `.pi/APPEND_SYSTEM.md`: repo-local system prompt append, including caveman style and subagent guidance.
- `.pi/extensions/subagent/index.ts`: registers repo-local `subagent` tool.
- `.pi/extensions/subagent/agents.ts`: discovers user/project agent definitions for that tool.
- `.pi/agents/*.md`: repo-local agent definitions used by subagent tool (`scout`, `planner`, `worker`, `reviewer`).
- `.pi/prompts/subagent-*.md`: convenience prompt templates for common scout/plan/implement/review chains.

Current subagent defaults in this repo:

- tool defaults to `agentScope: "project"`
- project-agent confirmation defaults to `false`
- child agents are separate `pi --mode json -p --no-session` processes
- repo agents are configured as leaf workers; `worker` gets explicit coding tools and agents are instructed not to recurse into subagents by default

## `apps/server`

### What it owns

- HTTP server
- WebSocket RPC server
- startup/readiness sequencing
- provider runtime lifecycle
- orchestration command/event engine
- sqlite persistence + migrations
- git integration
- terminal PTY lifecycle
- server settings and keybindings runtime
- observability and analytics

### Key source files

- [`src/bin.ts`](../apps/server/src/bin.ts): CLI launch
- [`src/server.ts`](../apps/server/src/server.ts): layer composition
- [`src/ws.ts`](../apps/server/src/ws.ts): RPC handlers and WebSocket route
- [`src/serverRuntimeStartup.ts`](../apps/server/src/serverRuntimeStartup.ts): readiness gate
- [`src/config.ts`](../apps/server/src/config.ts): runtime config

### Important subtrees

- [`src/orchestration`](../apps/server/src/orchestration): event-sourced domain core
- [`src/provider`](../apps/server/src/provider): adapters, registries, provider service
- [`src/persistence`](../apps/server/src/persistence): sqlite tables, migrations, repositories
- [`src/git`](../apps/server/src/git): git and PR/worktree logic
- [`src/terminal`](../apps/server/src/terminal): PTY services
- [`src/workspace`](../apps/server/src/workspace): file search/write/path safety
- [`src/observability`](../apps/server/src/observability): tracing and metrics

## `apps/web`

### What it owns

- route tree and app shell
- local UI state
- typed RPC client transport
- orchestration event projection into UI state
- timeline/chat rendering
- terminals and diff UI
- settings pages
- desktop-aware tweaks

### Key source files

- [`src/main.tsx`](../apps/web/src/main.tsx): boot entry
- [`src/router.ts`](../apps/web/src/router.ts): TanStack router and providers
- [`src/nativeApi.ts`](../apps/web/src/nativeApi.ts): browser API resolver
- [`src/wsNativeApi.ts`](../apps/web/src/wsNativeApi.ts): typed WS-backed API
- [`src/store.ts`](../apps/web/src/store.ts): central orchestration event reducer

### High-signal subtrees/files

- [`src/components`](../apps/web/src/components): UI components
- [`src/routes`](../apps/web/src/routes): route files
- [`src/rpc`](../apps/web/src/rpc): transport state and RPC helpers
- [`src/lib`](../apps/web/src/lib): reusable utilities
- [`src/session-logic.ts`](../apps/web/src/session-logic.ts): derived thread/timeline logic

## `apps/desktop`

### What it owns

- desktop process lifecycle
- backend child process spawn and restart
- preload bridge
- updater
- native dialogs/menu/open-external/open-terminal features
- packaged static protocol serving

### Key source files

- [`src/main.ts`](../apps/desktop/src/main.ts): main process
- [`src/preload.ts`](../apps/desktop/src/preload.ts): bridge to renderer
- [`src/backendPort.ts`](../apps/desktop/src/backendPort.ts): port resolution
- [`src/backendReadiness.ts`](../apps/desktop/src/backendReadiness.ts): readiness helpers
- [`src/updateMachine.ts`](../apps/desktop/src/updateMachine.ts): update state transitions

## `packages/contracts`

### Why start here

If data shape unclear, contracts first.

### Most important files

- [`src/index.ts`](../packages/contracts/src/index.ts): export surface
- [`src/orchestration.ts`](../packages/contracts/src/orchestration.ts): core domain types
- [`src/rpc.ts`](../packages/contracts/src/rpc.ts): WebSocket RPC group and methods
- [`src/provider.ts`](../packages/contracts/src/provider.ts): provider operation inputs/results
- [`src/server.ts`](../packages/contracts/src/server.ts): server-specific RPC schemas
- [`src/git.ts`](../packages/contracts/src/git.ts): git RPC/event shapes
- [`src/terminal.ts`](../packages/contracts/src/terminal.ts): terminal schemas
- [`src/settings.ts`](../packages/contracts/src/settings.ts): persisted settings shape

## `packages/shared`

### Important helpers

- [`src/DrainableWorker.ts`](../packages/shared/src/DrainableWorker.ts): queue-backed worker with `drain()`
- [`src/model.ts`](../packages/shared/src/model.ts): model normalization helpers
- [`src/streamingMessage.ts`](../packages/shared/src/streamingMessage.ts): merge streaming/non-streaming message updates
- [`src/logging.ts`](../packages/shared/src/logging.ts): rotating file sink and logging utilities
- [`src/serverSettings.ts`](../packages/shared/src/serverSettings.ts): persisted settings parsing
- [`src/projectScripts.ts`](../packages/shared/src/projectScripts.ts): script helpers
- [`src/searchRanking.ts`](../packages/shared/src/searchRanking.ts): shared search ranking logic

## `packages/client-runtime`

Small package. Holds environment-scoping helpers.

Files:

- [`src/knownEnvironment.ts`](../packages/client-runtime/src/knownEnvironment.ts)
- [`src/scoped.ts`](../packages/client-runtime/src/scoped.ts)

Current app is still largely single-environment in active UX, but package exists for upstream parity and future environment-aware work.

## `scripts`

### Most useful scripts

- [`scripts/dev-runner.ts`](../scripts/dev-runner.ts): dev env/port wiring
- [`scripts/desktop-automation.ts`](../scripts/desktop-automation.ts): desktop UI automation
- [`scripts/automation-cycle.ts`](../scripts/automation-cycle.ts): automation + research loop
- [`scripts/autoresearch-bridge.ts`](../scripts/autoresearch-bridge.ts): exports artifacts to external loop
- [`scripts/upstream-sync.ts`](../scripts/upstream-sync.ts): safe upstream sync
- [`scripts/build-desktop-artifact.ts`](../scripts/build-desktop-artifact.ts): packaging
- [`scripts/release-smoke.ts`](../scripts/release-smoke.ts): release validation
- [`scripts/roadmap-validate.ts`](../scripts/roadmap-validate.ts): roadmap validation

## Runtime entrypoint map by use case

### Start server package directly

- CLI entry: [`apps/server/src/bin.ts`](../apps/server/src/bin.ts)
- command parsing: `apps/server/src/cli.ts`
- server layer launch: `runServer` in [`apps/server/src/server.ts`](../apps/server/src/server.ts)

### Start web app

- Vite entry: [`apps/web/src/main.tsx`](../apps/web/src/main.tsx)

### Start desktop app

- Electron main: [`apps/desktop/src/main.ts`](../apps/desktop/src/main.ts)
- preload: [`apps/desktop/src/preload.ts`](../apps/desktop/src/preload.ts)
- renderer then loads shared web app

### Start dev workspace

- root script: [`scripts/dev-runner.ts`](../scripts/dev-runner.ts)
- root package scripts in [`package.json`](../package.json)

## Good first files by bug type

### Transport bug

- `packages/contracts/src/rpc.ts`
- `apps/server/src/ws.ts`
- `apps/web/src/wsTransport.ts`
- `apps/web/src/wsNativeApi.ts`

### Timeline/state bug

- `packages/contracts/src/orchestration.ts`
- `apps/server/src/orchestration/*`
- `apps/web/src/store.ts`
- `apps/web/src/session-logic.ts`

### pi provider bug

- `apps/server/src/provider/Layers/PiCodexAdapter.ts`
- `apps/server/src/provider/pi/PiRpc.ts`
- `apps/server/src/provider/Layers/ProviderService.ts`

### Checkpoint/diff bug

- `apps/server/src/orchestration/Layers/CheckpointReactor.ts`
- `apps/server/src/checkpointing/*`
- `apps/server/src/persistence/Projection*`
- `apps/web/src/lib/turnDiffTree.ts`
