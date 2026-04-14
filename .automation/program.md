# T3 Code desktop automation program

Goal: improve `scripts/desktop-automation.ts` and `scripts/automation-cycle.ts` so desktop automation stays reliable, artifact-rich, and does not get stuck during Pi-driven turns.

## Operating loop

1. Read latest automation artifacts under `.artifacts/automation-cycle/` or a provided artifact directory.
2. Identify the smallest failure or blind spot.
3. Make one bounded change.
4. Re-run the automation cycle or the narrowest relevant command.
5. Keep the change only if the new run is more reliable or produces better artifacts.

## Priorities

1. Never hang silently.
2. Capture enough artifacts to debug the failure without rerunning immediately.
3. Prefer deterministic selectors and explicit timeouts.
4. Preserve real desktop + Pi behavior. No mock-only shortcuts.
5. Keep changes small and reviewable.

## Rules

- Focus first on: launch, thread creation, composer readiness, prompt send, processing-state detection, completion detection, stall detection.
- Every failure path should write an actionable artifact (`summary.json`, `error.json`, screenshot, page text/html, console log).
- If a selector is flaky, improve the app surface with stable attributes instead of piling on retries.
- If a timeout is too coarse, split it into phase-specific timers.
- When the UI is ambiguous, surface stronger state in the product instead of adding brittle automation heuristics.
- After code changes run: `bun fmt`, `bun lint`, `bun typecheck`.

## Good next improvements

- Extend processing assertions to require specific state sequences, not just any progress.
- Record state transition timestamps more precisely.
- Capture desktop-side logs when available.
- Add stronger queue/steer assertions after product-side attributes change.
- Add a web fallback mode if desktop-only launch fails.

## Output format

For each iteration, write:

- observed failure or weakness
- exact files changed
- why this fix should improve reliability
- exact verification run
- whether result improved
