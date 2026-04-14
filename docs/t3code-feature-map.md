# T3 Code ↔ Pi Code feature parity map

Compared on **2026-04-13**.

Detailed delivery follow-up: [`docs/t3code-parity-delivery-plan.md`](./t3code-parity-delivery-plan.md)
Scheduled execution runbook: [`docs/t3code-parity-scheduled-runbook.md`](./t3code-parity-scheduled-runbook.md)

## Comparison baseline

- `t3code`: `/Users/suns/Developer/t3code` at `801b83e9` (`main`, same as `upstream/main`)
- `t3code-pi`: `/Users/suns/Developer/t3code-pi` current working tree

## How this map was built

Repo trees were compared path-for-path, excluding generated/build directories:

- `.git`
- `node_modules`
- `.turbo`
- `dist`
- `dist-electron`
- `.artifacts`
- `apps/desktop/.electron-runtime` (counted separately as a bundled runtime artifact, not product source)

## High-level parity snapshot

- **658** files exist at the same path in both repos
- **304** same-path files have diverged contents
- **143** files exist only in `t3code`
- **39** meaningful files exist only in `t3code-pi`
- plus **264** bundled Electron runtime files only in `t3code-pi/apps/desktop/.electron-runtime`

## Landed since this baseline snapshot

Since the initial 2026-04-13 parity snapshot, `t3code-pi` has landed several of the lower-risk upstream slices called out below:

- shared auth/environment contracts in `packages/contracts/src/auth.ts` and `packages/contracts/src/environment.ts`
- shared search ranking in `packages/shared/src/searchRanking.ts`
- provider-skill presentation/search helpers in `apps/web/src/providerSkillPresentation.ts` and `apps/web/src/providerSkillSearch.ts`
- window-controls overlay helper in `apps/web/src/lib/windowControlsOverlay.ts`
- command palette store, logic, and UI in `apps/web/src/commandPaletteStore.ts` and `apps/web/src/components/CommandPalette*.tsx`
- desktop helper modules in `apps/desktop/src/backendPort.ts`, `backendReadiness.ts`, `desktopSettings.ts`, `clientPersistence.ts`, and `serverExposure.ts`
- restored `packages/client-runtime/**`
- shared QR utility plus reusable renderer in `packages/shared/src/qrCode.ts` and `apps/web/src/components/ui/qr-code.tsx`
- repository identity and GitHub pull-request helper ports in `apps/server/src/project/Services/RepositoryIdentityResolver.ts`, `apps/server/src/project/Layers/RepositoryIdentityResolver.ts`, and `apps/server/src/git/githubPullRequests.ts`
- server runtime state persistence and orchestration HTTP helpers in `apps/server/src/serverRuntimeState.ts`, `apps/server/src/orchestration/runtimeLayer.ts`, and `apps/server/src/orchestration/http.ts`
- auth bootstrap utility helpers in `apps/server/src/startupAccess.ts`, `apps/server/src/cliAuthFormat.ts`, and `apps/server/src/auth/utils.ts`

The table below remains the original baseline comparison, but these landed slices now reduce the practical gap even where the full feature family is not yet end-to-end complete.

## 1:1 feature map

Legend:

- `MATCHED` = same feature surface is present
- `DIVERGED` = both repos have the feature, but the implementation has drifted
- `MISSING IN PI` = upstream feature exists in `t3code` but has not been ported
- `PI ONLY` = intentional feature added in `t3code-pi`

| Area                                      | T3 Code                                                                                             | Pi Code                                                      | Status             | Evidence                                                                                                                                                                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace/package layout                  | `apps/{desktop,marketing,server,web}` + `packages/{client-runtime,contracts,shared}`                | same apps, but **no `packages/client-runtime`**              | MISSING IN PI      | `packages/client-runtime/**` exists only in `t3code`                                                                                                                                                                                          |
| Server auth/bootstrap/pairing             | full auth subsystem, secret store, pairing/session services                                         | absent                                                       | MISSING IN PI      | `apps/server/src/auth/**`, `startupAccess.ts`, `cliAuthFormat.ts`, auth migrations exist only in `t3code`                                                                                                                                     |
| Shared auth/environment contracts         | auth + environment schemas exported from contracts package                                          | absent                                                       | MISSING IN PI      | `packages/contracts/src/auth.ts`, `packages/contracts/src/environment.ts`, `packages/contracts/src/server.test.ts` only in `t3code`                                                                                                           |
| Multi-environment runtime model           | local/remote environment runtime, catalog, connection service, environment-aware routes             | still single-environment thread routing                      | MISSING IN PI      | `apps/web/src/environments/**`, `environmentApi.ts`, `localApi.ts`, `_chat.$environmentId.$threadId.tsx`, `pair.tsx`, `settings.connections.tsx` only in `t3code`; Pi still uses `_chat.$threadId.tsx`                                        |
| Pairing + connection settings UX          | pairing route, QR code, connections settings UI                                                     | absent                                                       | MISSING IN PI      | `apps/web/src/components/auth/PairingRouteSurface.tsx`, `components/settings/ConnectionsSettings.tsx`, `components/ui/qr-code.tsx`, `pairingUrl.ts` only in `t3code`                                                                          |
| Command palette                           | extensible command palette store + UI                                                               | absent                                                       | MISSING IN PI      | `apps/web/src/commandPaletteStore.ts`, `components/CommandPalette*.tsx`, `CommandPalette.logic.ts` only in `t3code`                                                                                                                           |
| Provider skill discovery/presentation     | search + presentation helpers for provider skills                                                   | absent                                                       | MISSING IN PI      | `apps/web/src/providerSkillPresentation.ts`, `providerSkillSearch.ts` only in `t3code`                                                                                                                                                        |
| Desktop backend bootstrapping/persistence | backend port scan, readiness helpers, desktop settings, client persistence, server exposure helpers | not present                                                  | MISSING IN PI      | `apps/desktop/src/backendPort.ts`, `backendReadiness.ts`, `desktopSettings.ts`, `clientPersistence.ts`, `serverExposure.ts` only in `t3code`                                                                                                  |
| Desktop shell and preload                 | present in both                                                                                     | Pi-specific integration changes                              | DIVERGED           | `apps/desktop/src/main.ts`, `preload.ts`, `updateState.ts` differ                                                                                                                                                                             |
| Web chat shell/core UX                    | present in both                                                                                     | present, but heavily modified for Pi                         | DIVERGED           | `apps/web/src/components/ChatView*`, `Sidebar*`, `BranchToolbar*`, `DiffPanel*`, `GitActionsControl*`, `WebSocketConnectionSurface*` differ                                                                                                   |
| Chat virtualization / scroll infra        | newer browser-specialized components and virtualization path                                        | Pi has custom scroll/timeline work, but not upstream surface | DIVERGED           | upstream-only `ChatMarkdown.browser.tsx`, `ThreadTerminalDrawer.browser.tsx`, `SplashScreen.tsx`, `NoActiveThreadState.tsx`, `ChatComposer.tsx`; Pi-only `chat-scroll.ts`, `MessagesTimeline.virtualization.browser.tsx`, `timelineHeight.ts` |
| Window controls overlay support           | present                                                                                             | absent                                                       | MISSING IN PI      | `apps/web/src/lib/windowControlsOverlay.ts` only in `t3code`                                                                                                                                                                                  |
| Server runtime/orchestration HTTP surface | newer runtime state + orchestration HTTP glue                                                       | absent                                                       | MISSING IN PI      | `apps/server/src/orchestration/http.ts`, `runtimeLayer.ts`, `serverRuntimeState.ts`, `http.test.ts` only in `t3code`                                                                                                                          |
| Worktree/bootstrap improvements           | upstream keeps landing server-side worktree bootstrapping improvements                              | Pi has worktree folders but not the same helper surface      | DIVERGED           | upstream-only `serverRuntimeState.ts`, `startupAccess.ts`; Pi has `apps/server/worktrees/`                                                                                                                                                    |
| GitHub PR + repository identity helpers   | GitHub PR helper and repo identity resolver                                                         | absent                                                       | MISSING IN PI      | `apps/server/src/git/githubPullRequests.ts`, `project/RepositoryIdentityResolver.ts` only in `t3code`                                                                                                                                         |
| Provider runtime integration              | Codex/Claude-first provider runtime                                                                 | Pi provider adapter + RPC bridge added                       | PI ONLY / DIVERGED | `apps/server/src/provider/Layers/PiCodexAdapter.ts`, `PiCodexProvider.ts`, `apps/server/src/provider/pi/PiRpc.ts` only in `t3code-pi`; shared provider files also differ                                                                      |
| Server core runtime                       | present in both                                                                                     | present in both, but deeply forked                           | DIVERGED           | `codexAppServerManager.ts`, `ProviderService.ts`, `ProviderRegistry.ts`, `server.ts`, `serverRuntimeStartup.ts`, `ws.ts`, `terminal/**`, `git/**`, `persistence/**`, `orchestration/**` differ widely                                         |
| Shared repo utilities                     | git/model utilities exist in both                                                                   | same surface but drifted                                     | DIVERGED           | `packages/shared/src/git.ts`, `Net.ts`, `model.test.ts` differ                                                                                                                                                                                |
| Search ranking helper                     | present                                                                                             | absent                                                       | MISSING IN PI      | `packages/shared/src/searchRanking.ts` only in `t3code`                                                                                                                                                                                       |
| Thread title generation                   | not present as a standalone shared helper                                                           | dedicated thread title helper added                          | PI ONLY            | `packages/shared/src/threadTitle.ts` only in `t3code-pi`                                                                                                                                                                                      |
| Automation tooling                        | not present                                                                                         | desktop automation + autoresearch bridge                     | PI ONLY            | `scripts/desktop-automation.ts`, `automation-cycle.ts`, `autoresearch-bridge.ts`, `ui-validation.ts`, `docs/automation.md` only in `t3code-pi`                                                                                                |
| Upstream sync tooling                     | not present                                                                                         | tracked upstream sync manifest and apply/check tooling       | PI ONLY            | `scripts/upstream-sync.ts`, `.upstream-sync/manifest.json`, `docs/upstream-sync.md`, `.github/workflows/upstream-sync.yml` only in `t3code-pi`                                                                                                |
| Marketing/download branding               | T3 Code branding and upstream release metadata                                                      | Pi Code branding and repo overrides                          | DIVERGED           | `apps/marketing/src/pages/index.astro`, `download.astro`, `lib/releases.ts`, `package.json`, `README.md` differ                                                                                                                               |
| Repo ops/docs                             | baseline upstream docs                                                                              | Pi adds notice/security/upstream docs                        | PI ONLY / DIVERGED | `NOTICE.md`, `SECURITY.md`, `docs/upstream-sync.md`, `docs/automation.md`; `.docs/remote-architecture.md` exists only upstream                                                                                                                |

## Biggest upstream feature gaps in Pi Code

These are the clearest missing feature families relative to current `t3code`:

1. **Auth + pairing stack**
   - Missing server auth control plane, secret/session persistence, pairing links, bootstrap credentials.
   - Missing web pairing route and QR-based connection UX.

2. **Multi-environment support**
   - Missing environment-aware contracts, runtime catalog/service, local/remote APIs, and environment-scoped routes.
   - Current Pi route model is still centered on `threadId`, not `environmentId + threadId`.

3. **Command palette**
   - Upstream shipped an extensible command palette; Pi has not ported the store or UI.

4. **Desktop runtime hardening from upstream**
   - Missing backend readiness/port scan helpers and desktop settings persistence helpers.

5. **Newer shared utilities used by upstream UX**
   - Missing `client-runtime`, search ranking, QR code support, provider skill search/presentation helpers, and window controls overlay support.

## Biggest intentional Pi-only additions

1. **Pi execution path**
   - `PiCodexAdapter`, `PiCodexProvider`, and `provider/pi/PiRpc.ts` wire the app into the pi runtime.

2. **Automation loop**
   - Dedicated desktop automation, automation-cycle runner, and autoresearch bridge.

3. **Upstream sync infrastructure**
   - Safe ownership/manifest-based sync flow for merging from `t3code` and `pi-mono`.

4. **Thread-title normalization helper**
   - Shared utility for Pi-specific sidebar title generation behavior.

## Recently visible upstream changes worth reviewing first

Based on the current `t3code` history and file surface, the highest-value upstream items to evaluate for Pi are:

1. **Command palette** (`feat(web): add extensible command palette`)
2. **Multi-environment + pairing/auth flow** (`Implement server auth bootstrap and pairing flow`, `Prepare datamodel for multi-environment`)
3. **Desktop readiness/port hardening** (`increase backend readiness timeout`, sequential backend port scan)
4. **Window controls overlay support**
5. **Provider skill discovery/search UX**
6. **Recent worktree/bootstrap fixes** (`Allow empty server threads to bootstrap new worktrees`)

## Recommended merge order

If the goal is to close parity without destabilizing Pi runtime integration, this order is the safest:

1. **Low-risk shared additions**
   - `packages/contracts/src/auth.ts`
   - `packages/contracts/src/environment.ts`
   - `packages/shared/src/searchRanking.ts`
   - `packages/shared/src/qrCode.ts`

2. **Web-only additive features**
   - command palette
   - pairing UI
   - connections settings UI
   - provider skill discovery helpers
   - window controls overlay

3. **Desktop hardening helpers**
   - backend port/readiness/settings/server exposure modules

4. **Server additive helpers**
   - repository identity resolver
   - GitHub PR helper
   - auth bootstrap/pairing services

5. **High-risk merge zones last**
   - `provider/**`
   - `codexAppServerManager.ts`
   - `ProviderService.ts`
   - `orchestration/**`
   - `terminal/**`
   - `ws.ts`
   - `server.ts`

## Bottom line

`t3code-pi` is **not** in 1:1 feature parity with current `t3code`.

It has a strong shared shell, but it is currently behind upstream in these major product capabilities:

- auth/pairing
- multi-environment support
- command palette
- several desktop hardening helpers
- some newer web UX utilities

At the same time, `t3code-pi` already has important **Pi-only** value that upstream does not have:

- pi runtime/provider integration
- desktop automation and autoresearch loop
- upstream sync tooling
- Pi-specific thread-title behavior

So the practical picture is:

- **shared foundation:** yes
- **exact feature parity:** no
- **main upstream gaps:** auth, environments, command palette, desktop/runtime hardening
- **main Pi-only strengths:** runtime integration, automation, sync tooling
