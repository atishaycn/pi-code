# Development workflows

## Default quality bar

Task not done until these pass:

- `bun fmt`
- `bun lint`
- `bun typecheck`

Tests:

- use `bun run test`
- do **not** run plain `bun test`

## Common root commands

Defined in [`package.json`](../package.json).

### Daily dev

- `bun run dev`
- `bun run dev:server`
- `bun run dev:web`
- `bun run dev:desktop`

### Build

- `bun run build`
- `bun run build:desktop`
- `bun run build:marketing`

### Validation

- `bun fmt`
- `bun lint`
- `bun typecheck`
- `bun run test`
- `bun run test:desktop-smoke`

### Operations

- `bun run automation:desktop`
- `bun run automation:cycle`
- `bun run automation:autoresearch-bridge`
- `bun run sync:upstreams:check`
- `bun run sync:upstreams:apply`
- `bun run roadmap:validate`
- `bun run wiki:lint`

## Dev runner

Main file: [`scripts/dev-runner.ts`](../scripts/dev-runner.ts)

### Why it exists

Keeps dev ports and environment wiring deterministic across modes.

### Base ports

- server: `3773`
- web: `5733`

### Offset behavior

Can shift ports using:

- `T3CODE_PORT_OFFSET`
- `T3CODE_DEV_INSTANCE`

Why important:

- lets multiple repo instances run in parallel
- keeps server/web ports aligned

### Home/state dir

Dev commands default state under isolated T3 home path so dev state does not collide with desktop/prod state.

## Good local flows

### Backend + web

```bash
bun run dev
```

### Desktop dev

```bash
bun run dev:desktop
```

### Production-like server start

```bash
bun run build
bun run start
```

### Build desktop app and smoke test

```bash
bun run build:desktop
bun run test:desktop-smoke
bun run start:desktop
```

### Safe local desktop restart flow

Good when verifying packaged-like desktop startup from repo root:

```bash
bun run restart:desktop
```

Helper script:

- `scripts/restart-desktop-clean.sh`

What it does:

1. moves to repo root
2. kills packaged desktop/backend child processes for this repo
3. prints listeners on common desktop ports
4. runs `bun run build:desktop`
5. runs `bun run start:desktop`

Equivalent manual flow:

```bash
cd /Users/suns/Developer/t3code-pi
pkill -f "/Users/suns/Developer/t3code-pi/apps/server/dist/bin.mjs" || true
pkill -f "/Users/suns/Developer/t3code-pi/apps/desktop/dist-electron/main.cjs" || true
bun run build:desktop
bun run start:desktop
```

But if desktop behaves strangely, also check for stray dev servers still holding default ports, especially `3773`:

```bash
lsof -nP -iTCP -sTCP:LISTEN | rg ':(3773|3774|3775|5733)'
```

Why:

- desktop startup bug on 2026-04-14 came from old dev server still listening on default desktop port
- killing only bundled `dist/bin.mjs` child was not enough if another dev server like `bun run src/bin.ts` was still alive

## Automation workflows

Reference doc: [`docs/automation.md`](../docs/automation.md)

### `automation:desktop`

Uses built Electron app and runs real UI scenario.

Good for:

- regression checks in actual desktop shell
- screenshots and artifacts
- checking agent progress states and prompt/send loop

### `automation:cycle`

Bigger loop:

1. optionally build desktop app
2. run automation
3. write artifact bundle
4. feed autoresearch bridge/external agent loop

### Artifact locations

- `.artifacts/desktop-automation/<timestamp>/`
- `.artifacts/automation-cycle/<timestamp>/`

## Upstream sync workflow

Reference doc: [`docs/upstream-sync.md`](../docs/upstream-sync.md)

### Commands

```bash
bun run sync:upstreams:bootstrap
bun run sync:upstreams:check
bun run sync:upstreams:apply
```

### Important rule

System is ownership/manifest based. Do not assume safe overwrite from upstream.

## Wiki maintenance workflow

When repo architecture/workflow meaningfully changes:

1. update relevant page in `wiki/`
2. append `wiki/log.md`
3. run `bun run wiki:lint`

## Good search-first habits

Before adding code:

- scan contracts for existing schema
- scan `packages/shared` for reusable utility
- scan server layers/services for existing abstraction
- scan web stores/hooks/components for existing state path

This repo prefers extraction over duplicated local logic.

## Safe task patterns for agents

### For broad tasks

1. read `wiki/index.md`
2. read matching wiki page
3. read real source files
4. search for shared helper before writing code

### For source changes

1. read full file before editing
2. prefer smallest valid edit
3. verify with tests or strongest checks available
4. update wiki if durable architecture fact changed

## Git safety reminders

From project instructions:

- do not use destructive reset/clean/stash commands without explicit user confirmation
- do not stage unrelated files
- check `git status` before commit
- if merge/rebase conflict hits files you did not touch, stop and ask

## Useful docs to keep open

- [`README.md`](../README.md)
- [`AGENTS.md`](../AGENTS.md)
- [`docs/automation.md`](../docs/automation.md)
- [`docs/observability.md`](../docs/observability.md)
- [`docs/upstream-sync.md`](../docs/upstream-sync.md)
- [`KEYBINDINGS.md`](../KEYBINDINGS.md)
