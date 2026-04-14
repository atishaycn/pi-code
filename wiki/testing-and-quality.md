# Testing and quality

## Mandatory checks

Project instructions require these before done:

```bash
bun fmt
bun lint
bun typecheck
```

Use workspace tests with:

```bash
bun run test
```

Never use plain `bun test` in this repo.

## Test stack

### Server and shared packages

- Vitest
- lots of unit tests around Effect services and pure helpers

### Web

- Vitest for logic/component tests
- browser tests for some UI/screenshot flows
- route/state/logic tests around chat timeline and UI behaviors

### Desktop

- unit tests for helpers
- smoke test script for packaged-ish desktop app
- higher-level automation through Playwright-driven desktop flow in `scripts/desktop-automation.ts`

## Where quality is enforced

### Formatting

- tool: `oxfmt`
- command: `bun fmt`

### Lint

- tool: `oxlint`
- command: `bun lint`

### Typecheck

- workspace-wide Turbo task
- command: `bun typecheck`

### Tests

- command: `bun run test`
- each package has its own `test` script

## Test-heavy subsystems worth trusting

The repo has many focused tests around these areas:

- orchestration engine and projector logic
- provider adapters and registry paths
- checkpointing and migration behavior
- git layers
- terminal manager
- web chat/session/transport logic
- shared helpers like `DrainableWorker`, model normalization, streaming merge

Meaning: when changing these areas, add/adjust tests near existing file family instead of inventing distant test harnesses.

## Deterministic testing patterns used in repo

### Drainable workers

`DrainableWorker` exists mostly to avoid timing sleeps in tests.

If code already uses queue worker pattern, prefer `drain()` over arbitrary waits.

### Receipts instead of polling

Checkpoint and runtime systems emit receipts when async work settles.

Prefer waiting on receipt semantics over:

- `setTimeout`
- polling sqlite state
- polling git filesystem state

### Small pure reducers/helpers

Many web and orchestration helpers are intentionally pure. Extend those tests first when changing behavior.

## Good validation choices by change type

### Contracts / schema change

Run:

```bash
bun typecheck
bun run test --filter=@t3tools/contracts
```

Also read all downstream consumers.

### Server orchestration or provider change

Run at least:

```bash
bun run test --filter=t3
bun lint
bun typecheck
```

Likely impacted areas:

- `apps/server/src/orchestration/**/*.test.ts`
- `apps/server/src/provider/**/*.test.ts`
- `apps/server/src/persistence/**/*.test.ts`

### Web reducer or timeline change

Run at least:

```bash
bun run test --filter=@t3tools/web
bun lint
bun typecheck
```

Likely impacted areas:

- `apps/web/src/store.test.ts`
- `apps/web/src/session-logic*.test.ts`
- component logic tests nearby

### Desktop change

Run at least:

```bash
bun run test --filter=@t3tools/desktop
bun run test:desktop-smoke
bun lint
bun typecheck
```

If UX-sensitive, also run:

```bash
bun run automation:desktop
```

## CI and release quality shape

Root CI and release docs show repo expects:

- lint
- typecheck
- test
- artifact builds for release paths

See:

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- [`docs/release.md`](../docs/release.md)

## What to inspect when tests fail

### WS transport decode failures

Read:

- `packages/contracts/src/rpc.ts`
- `apps/server/src/ws.ts`
- `apps/web/src/wsTransport.ts`

### Timeline/reducer mismatches

Read:

- `packages/contracts/src/orchestration.ts`
- `apps/server/src/orchestration/projector.ts`
- `apps/web/src/store.ts`

### Checkpoint flake

Read:

- `apps/server/src/orchestration/Layers/CheckpointReactor.ts`
- `apps/server/src/checkpointing/*`
- `packages/shared/src/DrainableWorker.ts`

## Wiki validation

This repo now includes lightweight wiki validation.

Run:

```bash
bun run wiki:lint
```

Current linter checks:

- every markdown file in `wiki/`
- relative markdown/source links resolve
- `wiki/index.md` and `wiki/log.md` exist

## Practical completion checklist

Before saying done:

1. code/docs/wiki updated
2. `bun fmt`
3. `bun lint`
4. `bun typecheck`
5. relevant targeted tests or smoke/automation if change touched runtime/UI
6. `bun run wiki:lint` if wiki changed
