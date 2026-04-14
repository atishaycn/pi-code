# Upstream sync

This repo is a hybrid of two upstream projects:

- `t3code`
- `pi-mono`

Blindly overwriting files from either upstream would be unsafe, because some files are now intentionally merged or locally customized.

So the sync system uses a safer model:

1. **Bootstrap ownership** for files that still exactly match an upstream file at the same path.
2. **Track a baseline hash** for each owned file in `.upstream-sync/manifest.json`.
3. On later runs, classify tracked files as:
   - **safe update**: local file still matches baseline, upstream changed
   - **conflict**: local file changed and upstream changed
   - **local-only drift**: local file changed, upstream did not
   - **unchanged**
4. **Apply only safe updates automatically**.
5. Leave conflicts for manual review.

This gives you an automated update path without silently stomping local integration work.

## Commands

```bash
node scripts/upstream-sync.ts bootstrap
node scripts/upstream-sync.ts check
node scripts/upstream-sync.ts apply
```

Or through package scripts:

```bash
bun run sync:upstreams:bootstrap
bun run sync:upstreams:check
bun run sync:upstreams:apply
```

## Source selection

By default the script will use local clones when present:

- `/Users/suns/Developer/t3code`
- `/Users/suns/Developer/pi-mono`

If those are missing, it falls back to shallow GitHub clones.

When local clones are used, the script checks the configured remote/ref instead of whatever branch happens to be checked out locally. Defaults:

- `t3code`: `upstream/main`
- `pi-mono`: `origin/main`

You can override with env vars:

```bash
UPSTREAM_T3CODE_PATH=/path/to/t3code
UPSTREAM_T3CODE_REMOTE=upstream
UPSTREAM_T3CODE_URL=https://github.com/pingdotgg/t3code.git
UPSTREAM_T3CODE_REF=main

UPSTREAM_PI_MONO_PATH=/path/to/pi-mono
UPSTREAM_PI_MONO_REMOTE=origin
UPSTREAM_PI_MONO_URL=https://github.com/badlogic/pi-mono.git
UPSTREAM_PI_MONO_REF=main
```

You can also force local or remote mode:

```bash
node scripts/upstream-sync.ts check --source-mode local
node scripts/upstream-sync.ts check --source-mode remote
```

## Files written

- manifest: `.upstream-sync/manifest.json`
- run artifacts: `.artifacts/upstream-sync/<timestamp>/summary.json`
- human summary: `.artifacts/upstream-sync/<timestamp>/summary.md`

## Recommended workflow

For a human-readable parity snapshot against current upstream, see [docs/t3code-feature-map.md](./t3code-feature-map.md).
For the detailed implementation plan and the recurring scheduled-run procedure, see [docs/t3code-parity-delivery-plan.md](./t3code-parity-delivery-plan.md) and [docs/t3code-parity-scheduled-runbook.md](./t3code-parity-scheduled-runbook.md).

### First time

```bash
bun run sync:upstreams:bootstrap
bun run sync:upstreams:check
```

Review the generated manifest and summary.

### Regular maintenance

```bash
bun run sync:upstreams:check
bun run sync:upstreams:apply
bun fmt
bun lint
bun typecheck
```

## What this does not do yet

- it does not auto-resolve three-way merge conflicts
- it only tracks files that exactly matched an upstream file during bootstrap
- it assumes the same relative path in this repo and the upstream repo

That is intentional for now: safe incremental automation is better than a clever but destructive importer.
