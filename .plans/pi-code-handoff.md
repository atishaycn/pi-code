Continue work on `/Users/suns/Developer/t3code-pi`.

Goal
- Real T3 Code desktop/web app wired to Pi runtime from `/Users/suns/Developer/pi-mono/pi-test.sh`.
- Make UX feel smooth and native.
- Keep queued follow-ups and steer support.

Current status
- Pi launcher resolution fixed.
  - Default bare `pi` now falls back to `/Users/suns/Developer/pi-mono/pi-test.sh` when present.
- Steer support added.
  - Mid-run `Steer now` sends real `streamingBehavior: "steer"` to Pi.
  - Queued follow-ups still exist separately.
- Empty assistant response bug fixed.
- Early-ready/finalization bug fixed.
  - `turn.completed` no longer marks session ready before final assistant message flush.
- Processing panel improved.
  - Shows `Pi running command`, `Pi editing files`, `Pi inspecting repo`, `Pi finalizing response`, etc., based on latest work-log item.

Important files changed recently
- `apps/server/src/provider/pi/PiRpc.ts`
- `apps/server/src/provider/Layers/PiCodexProvider.ts`
- `apps/server/src/provider/Layers/PiCodexAdapter.ts`
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/ComposerPrimaryActions.tsx`
- `packages/contracts/src/provider.ts`
- `packages/contracts/src/orchestration.ts`
- `packages/contracts/src/rpc.ts`
- `packages/contracts/src/ipc.ts`

Checks already passing
- `bun fmt`
- `bun lint`
- `bun typecheck`
- targeted vitest coverage for provider runtime ingestion and ws native API/contracts

Known remaining rough edges
- Existing TS32 advisories remain in `apps/server/src/provider/Layers/PiCodexAdapter.ts` about `Effect.runPromise` inside an Effect.
- Need more end-to-end polish/live smoke through desktop UI.
- Possible remaining work-log rendering polish for Pi tool/result events.

What user cares about most
- Smooth native T3 feel.
- Clear in-progress states.
- No confusing silent gaps.
- Continue improving actual desktop app behavior, not mock UI.

Suggested next step
1. Reproduce a live prompt with tool call in desktop app.
2. Verify processing panel text changes as tool phases change.
3. If still confusing, refine status copy and/or surface active tool name in timeline/header.
4. Then help user continue this same line of work in-app.
