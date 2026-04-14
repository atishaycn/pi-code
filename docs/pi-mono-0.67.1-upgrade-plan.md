# pi-mono coding-agent 0.67.1 upgrade plan

## Goal

Update Pi Code's embedded pi-mono integration to account for `@mariozechner/pi-coding-agent` `0.67.1`, document actual upstream changes, and harden the app boundary so Pi Code keeps predictable embedded-runtime behavior.

## Upstream changes in 0.67.1

Source reviewed:

- local upstream clone: `/Users/suns/Developer/pi-mono/packages/coding-agent/CHANGELOG.md`
- npm package tarball for `@mariozechner/pi-coding-agent@0.67.1`

Relevant upstream changes:

1. **Interactive install telemetry**
   - New lightweight install/update ping in interactive mode.
   - Triggered after `lastChangelogVersion` writes.
   - Disabled by `enableInstallTelemetry=false`, `PI_OFFLINE=1`, or `PI_TELEMETRY=0`.
   - Upstream says this does **not** run in RPC, print, JSON, or SDK mode.

2. **`openRouterRouting` support in `models.json`**
   - Full routing config support upstream.
   - Useful to Pi Code because model discovery comes from pi RPC.
   - No local schema or protocol change required in Pi Code because model enumeration already flows through pi.

3. **`PI_CODING_AGENT=true` at startup**
   - pi now marks child processes as running inside coding-agent.
   - Helpful upstream feature. No local change required because pi owns that process tree once launched.

4. **Fixes with possible embedder relevance**
   - OpenAI Codex `serviceTier` forwarding fixed upstream.
   - Long-session `Container.render()` stack overflow fixed upstream.
   - `/tree` queued-message flush fix.
   - editor sticky-column fix around paste markers.
   - Gemma/Gemini thinking-level fixes.

## Impact on Pi Code

### No protocol migration needed

Pi Code launches pi in RPC mode and uses:

- `--mode rpc`
- `get_available_models`
- `get_commands`
- prompt/send/abort/state/stats RPC commands

  0.67.1 does not change those APIs in a way that requires local adapter rewrites.

### Main integration risk: telemetry behavior drift

Even though upstream telemetry is interactive-only today, Pi Code is an embedded product, not a normal terminal launcher. Best boundary:

- keep app-launched pi processes explicitly telemetry-free
- avoid depending on an upstream implementation detail staying interactive-only forever
- keep behavior identical across probes and live sessions

### Areas touched in Pi Code

1. `apps/server/src/provider/pi/PiRpc.ts`
   - central place for pi launcher/path/env helpers
2. `apps/server/src/provider/Layers/PiCodexProvider.ts`
   - provider probes for version/models
3. `apps/server/src/provider/Layers/PiCodexAdapter.ts`
   - live pi RPC session startup
4. `apps/server/src/ws.ts`
   - slash-command probing path
5. docs/tests

## Implementation plan

### Plan A — centralize pi launcher env handling

Add one helper in `PiRpc.ts` that:

- trims and sets `PI_CODING_AGENT_DIR` when configured
- can force `PI_TELEMETRY=0` for embedded launches

Reason:

- current env assembly was duplicated
- 0.67.1 introduces a release-specific env concern
- one helper keeps probes and live sessions aligned

### Plan B — hard-disable telemetry for all app-launched pi processes

Use helper from:

- provider model/version probes
- live RPC session startup
- slash-command probing

Reason:

- Pi Code should not emit upstream install telemetry from embedded runs
- avoids future regressions if upstream telemetry scope expands beyond interactive startup

### Plan C — document the upgrade and boundary

Update repo docs to state:

- what changed upstream
- what affects Pi Code
- what was implemented locally
- that embedded launches set `PI_TELEMETRY=0`

### Plan D — test boundary

Add focused unit coverage for launcher env helper:

- `PI_CODING_AGENT_DIR` is trimmed and set
- `PI_TELEMETRY=0` is injected when requested
- telemetry env is left untouched when not requested

## Implemented

Done in this repo:

- Added `buildPiLauncherEnv()` in `apps/server/src/provider/pi/PiRpc.ts`
- Reused helper from:
  - `apps/server/src/provider/Layers/PiCodexProvider.ts`
  - `apps/server/src/provider/Layers/PiCodexAdapter.ts`
  - `apps/server/src/ws.ts`
- Added unit tests in `apps/server/src/provider/pi/PiRpc.test.ts`
- Updated `README.md` to document embedded `PI_TELEMETRY=0`

## Validation checklist

Run after changes:

```bash
bun fmt
bun lint
bun typecheck
```

Recommended manual checks:

1. Start Pi Code with a local `pi-mono` launcher.
2. Verify provider probe still reports pi version/models.
3. Verify slash commands still load.
4. Start a Pi-backed thread and confirm RPC session works.
5. Confirm embedded pi subprocess environment includes `PI_TELEMETRY=0`.

## Non-goals for this upgrade

Not needed for 0.67.1:

- no client settings UI for telemetry
- no local `models.json` parser for `openRouterRouting`
- no changes to Pi Code RPC protocol
- no changes to reasoning/service-tier plumbing beyond inheriting upstream fixes
