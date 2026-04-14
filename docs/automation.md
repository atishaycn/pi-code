# Desktop automation

Pi Code now has a desktop automation path built for real Pi runtime flows.

## Commands

```bash
bun run automation:desktop
bun run automation:cycle
bun run automation:autoresearch-bridge
```

## What `automation:desktop` does

- launches the built Electron desktop app with an isolated `PI_T3CODE_HOME`
- waits for the composer or creates a new thread if needed
- enters a real prompt
- sends it to Pi
- watches visible processing states like:
  - `Pi running command`
  - `Pi editing files`
  - `Pi inspecting repo`
  - `Pi finalizing response`
- prefers stable test ids / data attributes when available
- can run either a basic scenario or a `steer-queue` scenario
- captures screenshots on state transitions
- writes artifacts for debugging instead of hanging silently

Artifacts go under `.artifacts/desktop-automation/<timestamp>/` by default.

## What `automation:cycle` does

- optionally builds desktop app first
- runs desktop automation
- writes an autoresearch-style context bundle for the latest run
- by default runs the local autoresearch bridge command
- optionally invokes a user-supplied `AUTORESEARCH_COMMAND`

Artifacts go under `.artifacts/automation-cycle/<timestamp>/` by default.

## Autoresearch usage

This repo ships `.automation/program.md`.

That file is meant as the durable instruction set for an external autonomous improvement loop in the style of `karpathy/autoresearch`:

1. inspect latest automation artifacts
2. make one small reliability improvement
3. rerun automation
4. keep only improvements that reduce flake or improve artifact quality

By default `automation:cycle` runs:

```bash
node scripts/autoresearch-bridge.ts
```

That bridge syncs the latest program/context bundle into `/tmp/autoresearch/runs/t3code-automation/latest/` when that repo exists.

To override with your own external command, set:

```bash
AUTORESEARCH_COMMAND='your-command-here'
```

Optional bridge env:

```bash
AUTORESEARCH_EXTERNAL_REPO=/tmp/autoresearch
AUTORESEARCH_AGENT_COMMAND='your-agent-command-here'
```

The command runs after the desktop automation pass, so it can inspect fresh artifacts.

## Notes

- `automation:desktop` requires a built desktop app. Run `bun run build:desktop` first, or use `bun run automation:cycle`.
- The automation uses real UI selectors. If it becomes flaky, prefer adding stable product-side attributes over longer retry loops.
