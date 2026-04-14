# Daily pi-mono update process

## Goal

Keep Pi Code aligned with upstream `pi-mono` without making the local integration messy.

This process is for the common case:

- check what changed upstream
- assess impact on `t3code-pi`
- implement only needed integration changes
- validate
- document

Do **not** mix this with unrelated feature work.

## Core rules

1. **Never pull blindly into a dirty `pi-mono` clone.**
   - Fetch first.
   - Audit first.
   - Merge/rebase only if you explicitly want upstream code inside that clone.

2. **Treat upstream `origin/main` as source of truth.**
   - Local `pi-mono` branches may contain experimental work.
   - Use fetch + diff against `origin/main` to avoid confusing local WIP with upstream release changes.

3. **Prefer embedder-boundary fixes over app-wide churn.**
   - If a new pi change only needs env/probe/session wiring changes, keep fix local to Pi adapter files.

4. **Keep probes and live sessions aligned.**
   - Any launcher/env change must hit all three paths:
     - provider probes
     - live pi RPC sessions
     - slash-command probes

5. **Document every upgrade pass.**
   - One short doc per meaningful upstream review is enough.

## Daily workflow

### 1) Check local repo state first

```bash
cd /Users/suns/Developer/pi-mono
git status --short
git branch --show-current
git remote -v
```

If dirty:

- do **not** pull
- continue with fetch-only audit

### 2) Fetch upstream safely

```bash
cd /Users/suns/Developer/pi-mono
git fetch origin --tags
```

### 3) Inspect coding-agent changes only

```bash
cd /Users/suns/Developer/pi-mono
git log --oneline --decorate HEAD..origin/main -- packages/coding-agent
git diff --name-status HEAD..origin/main -- packages/coding-agent
```

If local branch is not meaningful for comparison, compare release tags instead:

```bash
git tag --list 'v0.*' | tail -n 20
git show origin/main:packages/coding-agent/CHANGELOG.md | head -n 120
```

### 4) Classify upstream changes

Put each upstream item into one bucket:

#### Bucket A — no Pi Code action

Examples:

- interactive-only TUI polish
- docs-only changes
- bundled example-only changes
- provider behavior fully internal to pi with no adapter/API impact

#### Bucket B — runtime boundary change

Examples:

- env vars
- launcher args
- cwd/session startup behavior
- telemetry or network behavior
- auth/bootstrap changes

Action:

- update Pi Code launcher/probe/session boundary

#### Bucket C — protocol/API change

Examples:

- RPC command changes
- session/runtime method changes
- changed event payload shapes
- changed model/command discovery shape

Action:

- update Pi adapter code and tests before shipping

#### Bucket D — maybe relevant, verify manually

Examples:

- reasoning/thinking behavior changes
- model discovery behavior changes
- service-tier forwarding
- compaction behavior changes

Action:

- note it
- verify with a focused manual run if needed

### 5) Check Pi Code impact surface

Main files to inspect:

- `apps/server/src/provider/pi/PiRpc.ts`
- `apps/server/src/provider/Layers/PiCodexProvider.ts`
- `apps/server/src/provider/Layers/PiCodexAdapter.ts`
- `apps/server/src/ws.ts`
- `apps/web/src/components/settings/SettingsPanels.tsx`
- `packages/contracts/src/settings.ts`
- `README.md`
- `docs/upstream-sync.md`

Ask:

- does upstream change launcher env?
- does upstream change startup mode assumptions?
- does upstream change RPC shape?
- does upstream change settings users should know about?
- do we need a local guard so embedded use stays predictable?

### 6) Implement smallest correct boundary fix

Pattern:

- centralize shared logic in `PiRpc.ts`
- reuse from probes + live sessions + slash-command loading
- avoid three separate ad hoc edits

Good examples:

- env helper
- launcher arg helper
- path normalization helper
- version/model probe helper

### 7) Add focused regression coverage

At minimum for integration-affecting change:

- add/extend unit tests in `apps/server/src/provider/pi/PiRpc.test.ts`

If protocol/event mapping changed, add tests closer to:

- `PiCodexAdapter`
- provider layer tests
- ws server tests

### 8) Document the upgrade pass

Create one doc like:

- `docs/pi-mono-<version>-upgrade-plan.md`

Include:

- upstream changes reviewed
- what affects Pi Code
- what does not
- what was implemented
- validation run

### 9) Validate before done

Required:

```bash
cd /Users/suns/Developer/t3code-pi
bun fmt
bun lint
bun typecheck
```

If tests touched, run focused tests, for example:

```bash
cd /Users/suns/Developer/t3code-pi/apps/server
bun run test src/provider/pi/PiRpc.test.ts
```

### 10) Optional clean-up check

If upstream change seems risky, test against a clean upstream worktree instead of your local WIP clone:

```bash
cd /Users/suns/Developer/pi-mono
git worktree add /tmp/pi-mono-origin-main origin/main
```

Then point Pi Code at launcher inside that clean worktree.

## Recommended daily checklist

Use this exact order:

1. `pi-mono`: `git status --short`
2. `pi-mono`: `git fetch origin --tags`
3. inspect `packages/coding-agent` log + diff
4. read latest `CHANGELOG.md`
5. classify changes into A/B/C/D buckets
6. inspect Pi Code impact files
7. implement only needed integration changes
8. add focused tests
9. write/update upgrade note doc
10. run `bun fmt`
11. run `bun lint`
12. run `bun typecheck`
13. run focused tests
14. optional manual launcher verification

## What to avoid

Do not:

- pull upstream directly into a dirty `pi-mono` tree
- assume local `pi-mono` branch equals upstream
- change Pi Code for upstream docs/example churn
- duplicate env/launcher logic in multiple files
- ship without validating probes and live session startup paths

## Lightweight decision rule

If upstream change is:

- **interactive-only** and Pi Code embeds pi via RPC → usually no local code change
- **environment/startup/process-boundary related** → likely local boundary change needed
- **RPC/event/schema related** → local adapter change required
- **provider internal** → usually note it, then rely on upstream unless Pi Code transforms same field

## Current clean baseline

As of the `0.67.1` review:

- Pi Code explicitly sets `PI_TELEMETRY=0` for embedded pi launches
- launcher env logic is centralized in `apps/server/src/provider/pi/PiRpc.ts`
- probes and live sessions use same env helper

Keep future changes following that pattern.
