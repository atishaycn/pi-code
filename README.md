# Pi Code

Pi Code combines the real T3-style desktop/web UX with the pi coding-agent runtime.

- T3 app shell, layout, thread flow, composer, and desktop packaging stay intact.
- pi owns model execution, session state, tool calls, and provider auth.
- default pi launcher path: `pi` on your `PATH`

## Status

Working desktop app.

- desktop smoke test passes
- pi model list loads over RPC
- assistant streaming enabled by default
- empty assistant placeholder replies suppressed
- sidebar chat titles are auto-generated from the first user turn and normalized to sidebar-safe labels

## Quick start

Prerequisites:

- Bun `1.3.9`
- Node `24.13.1`
- a working `pi` launcher on your `PATH` (or a custom launcher path you can set in Settings -> Providers)

```bash
git clone https://github.com/suns/t3code-pi.git
cd t3code-pi
bun install
bun run build:desktop
bun run test:desktop-smoke
bun run start:desktop
```

`bun run build:desktop` now rebuilds all three desktop-facing artifacts together:

- `apps/web/dist`
- `apps/server/dist/client`
- `apps/desktop/dist-electron`

This prevents packaged/non-packaged desktop runs from picking up a stale bundled web client.

Then open Settings -> Providers if you want to point Pi Code at a different pi launcher or `PI_CODING_AGENT_DIR`.

If you point Pi Code at `~/Developer/pi-mono/pi-test.sh`, `/autoreason` stays off by default. Enable it in Settings -> Providers -> pi -> Enable /autoreason. Pi Code then launches the wrapper with autoreason support enabled.

Pi Code launches embedded pi RPC sessions with `PI_TELEMETRY=0`. Pi 0.67.1 install telemetry is interactive-only upstream, but Pi Code disables it explicitly for embedded runs.

## Sidebar chat titles

Pi Code now follows the same pattern as T3 Code's Developer app:

- the client seeds a provisional title from the first prompt, image name, or terminal context
- on the first turn, the server asks the configured text-generation model for a concise chat title
- the generated title is sanitized to a single-line, sidebar-safe label and replaces the provisional one
- custom/manual titles are preserved and never overwritten by the auto-title pass

The model used for this is controlled by **Settings → Text generation model**.

## Open-source notes

This repo is a combination work built from two MIT-licensed upstream projects:

- `t3code`
- `pi-mono`

See [NOTICE.md](./NOTICE.md) and [LICENSE](./LICENSE).

## Packaging notes

- Desktop release publishing uses `T3CODE_DESKTOP_UPDATE_REPOSITORY` or `GITHUB_REPOSITORY` when building artifacts.
- The marketing site can be pointed at another GitHub repo with `PUBLIC_GITHUB_REPO=owner/repo`.
- Root package metadata currently points at `https://github.com/suns/t3code-pi`.

## Development

Useful commands:

```bash
bun fmt
bun lint
bun typecheck
bun run test:desktop-smoke
bun run automation:desktop
bun run automation:cycle
bun run automation:autoresearch-bridge
bun run sync:upstreams:check
bun run sync:upstreams:apply
```

Observability guide: [docs/observability.md](./docs/observability.md)
Automation guide: [docs/automation.md](./docs/automation.md)
Upstream sync guide: [docs/upstream-sync.md](./docs/upstream-sync.md)

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.
