# Operations and release

## Observability

Reference doc: [`docs/observability.md`](../docs/observability.md)

### Persisted observability artifact

Main persisted backend artifact is trace NDJSON, not plain server log.

Important facts:

- pretty logs go to stdout
- spans are written to local NDJSON trace file
- OTLP traces/metrics are optional
- provider native/canonical event logs still exist separately

### Good files

- [`apps/server/src/observability/Layers/Observability.ts`](../apps/server/src/observability/Layers/Observability.ts)
- [`apps/server/src/observability/TraceRecord.ts`](../apps/server/src/observability/TraceRecord.ts)
- [`apps/server/src/observability/Metrics.ts`](../apps/server/src/observability/Metrics.ts)

### Useful env vars

- `T3CODE_TRACE_FILE`
- `T3CODE_TRACE_MIN_LEVEL`
- `T3CODE_TRACE_TIMING_ENABLED`
- `T3CODE_OTLP_TRACES_URL`
- `T3CODE_OTLP_METRICS_URL`
- `T3CODE_OTLP_SERVICE_NAME`

## Desktop operations

Main file: [`apps/desktop/src/main.ts`](../apps/desktop/src/main.ts)

### What desktop main process manages

- backend child process boot/restart
- authenticated loopback WebSocket URL generation
- preload bridge
- packaged logging sinks
- update state machine
- menu actions and native dialogs
- packaged static file protocol

### Important state paths

Desktop resolves base/userdata dirs and stores:

- settings
- logs
- bundled backend runtime metadata

If packaged desktop bug only happens outside dev, start by reading path-resolution and static-dir helpers.

## Auto-update flow

Reference doc: [`docs/release.md`](../docs/release.md)

### Runtime behavior

- updater checks in background after startup delay and on interval
- no auto-download
- no auto-install until user action
- desktop bridge exposes update state and actions to renderer

### Build/release behavior

Release pipeline builds:

- macOS arm64 DMG
- macOS x64 DMG
- Linux AppImage
- Windows NSIS installer

Also publishes updater metadata and CLI package.

### Important build helpers

- [`scripts/build-desktop-artifact.ts`](../scripts/build-desktop-artifact.ts)
- [`scripts/merge-mac-update-manifests.ts`](../scripts/merge-mac-update-manifests.ts)
- [`scripts/release-smoke.ts`](../scripts/release-smoke.ts)

## Automation operations

Reference doc: [`docs/automation.md`](../docs/automation.md)

### Artifact dirs

- `.artifacts/desktop-automation/`
- `.artifacts/automation-cycle/`
- `.artifacts/upstream-sync/`

### Good use

- inspect failing UX states
- compare screenshots over time
- feed autoresearch loop

## Upstream sync operations

Reference doc: [`docs/upstream-sync.md`](../docs/upstream-sync.md)

### Core files

- [`scripts/upstream-sync.ts`](../scripts/upstream-sync.ts)
- [`.upstream-sync/manifest.json`](../.upstream-sync/manifest.json)

### Mental model

- bootstrap records owned files and baseline hash
- later checks classify safe update vs conflict vs local drift
- only safe updates auto-apply

Do not bypass this with blind copies unless user explicitly wants risky overwrite work.

## Release and publish surface

### Root package scripts

Important release-adjacent scripts in [`package.json`](../package.json):

- `dist:desktop:*`
- `release:smoke`
- `sync:upstreams:*`

### CLI publish

`apps/server` package publishes CLI `t3`.

Reference package: [`apps/server/package.json`](../apps/server/package.json)

## Packaging notes agents should know

From README and release docs:

- root repo metadata points at `https://github.com/suns/t3code-pi`
- marketing site repo can be overridden with env
- desktop update repository can be overridden with env
- `build:desktop` intentionally rebuilds web + server + desktop to avoid stale bundled UI

## Runtime support modes

Reference doc: [`.docs/runtime-modes.md`](../.docs/runtime-modes.md)

Modes:

- full access
- supervised

These modes map into thread/session runtime metadata and provider launch behavior.

## Operational debugging shortcuts

### Backend starts in browser mode but desktop cannot connect

Check:

1. desktop-generated loopback URL/token
2. bootstrap pipe payload to server child
3. backend child logs
4. WebSocket auth token enforcement in `ws.ts`

### Server seems alive but UI stale

Check:

1. `server.trace.ndjson`
2. lifecycle/config/orchestration stream subscriptions
3. client WS connection state
4. domain event sequence ordering

### Release artifact broken only on packaged app

Check:

1. desktop static dir resolution
2. backend entry resolution
3. packaged env sanitation
4. updater feed config and runtime channel

## External reference docs

- [`README.md`](../README.md)
- [`docs/observability.md`](../docs/observability.md)
- [`docs/release.md`](../docs/release.md)
- [`docs/automation.md`](../docs/automation.md)
- [`docs/upstream-sync.md`](../docs/upstream-sync.md)
