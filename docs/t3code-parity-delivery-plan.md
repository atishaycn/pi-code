# T3 Code → Pi Code parity delivery master plan

Last updated: **2026-04-13**

This document is the detailed execution plan that continues from [`docs/t3code-feature-map.md`](./t3code-feature-map.md).

Companion docs:

- parity snapshot: [`docs/t3code-feature-map.md`](./t3code-feature-map.md)
- scheduled operating runbook: [`docs/t3code-parity-scheduled-runbook.md`](./t3code-parity-scheduled-runbook.md)
- live UI control center: `/roadmap`
- automatic progress/status source: repo-state detection plus `.artifacts/roadmap/latest-validation.json`

---

## 1. Delivery goal

Bring `t3code-pi` to a durable, repeatable, measurable parity program against current `t3code` **without breaking Pi-specific runtime integration**.

That means this plan optimizes for:

1. **typed additive ports first**
2. **web-only/UI-only changes before server-runtime surgery**
3. **shared contracts before cross-package rollout**
4. **reliable validation before claiming parity**
5. **scheduled repeatability**, not one heroic merge pass

---

## 2. Current baseline

### Current focus

- **Feature family:** Server runtime state and orchestration HTTP surface
- **Active action item:** Land the additive runtime-state persistence and orchestration HTTP routes so non-WebSocket inspection/bootstrap flows can rely on the same orchestration state already maintained by Pi.
- **Why now:** this is still a low-risk server-side parity slice, it builds directly on the orchestration/runtime work already in Pi, and it improves `/roadmap` auto-tracking with another end-to-end upstream helper family.

From the feature map:

- `t3code` baseline: `/Users/suns/Developer/t3code` at `801b83e9`
- `t3code-pi` parity status: **not 1:1**
- biggest missing areas:
  - auth + pairing
  - multi-environment runtime support
  - command palette
  - desktop startup hardening
  - several shared utilities and additive server helpers

The parity program is therefore organized into **13 missing feature families**.

---

## 3. Full missing-feature inventory

| Priority | Feature family                                                      | Primary packages                                      | Main dependency chain                                  |
| -------- | ------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| P0       | Auth bootstrap, secret storage, and pairing control plane           | `apps/server`, `packages/contracts`                   | contracts → persistence → server transport → UI        |
| P0       | Shared auth and environment contracts                               | `packages/contracts`                                  | none; foundation for downstream work                   |
| P0       | Multi-environment runtime model and routing                         | `apps/web`, `apps/server`, `packages/contracts`       | contracts → routing → transport                        |
| P0       | Pairing route, QR flow, and connections settings UX                 | `apps/web`, `packages/shared`                         | auth backend + QR utility                              |
| P1       | Extensible command palette                                          | `apps/web`, `packages/shared`                         | search ranking helper                                  |
| P2       | Provider skill discovery and presentation helpers                   | `apps/web`, `packages/shared`                         | search ranking helper                                  |
| P1       | Desktop backend readiness, port scanning, and persistence hardening | `apps/desktop`                                        | independent; low-risk additive                         |
| P2       | Window controls overlay support                                     | `apps/web`, `apps/desktop`                            | desktop shell hardening helps                          |
| P1       | Server runtime state and orchestration HTTP surface                 | `apps/server`                                         | additive; should reuse existing orchestration services |
| P1       | GitHub pull request and repository identity helpers                 | `apps/server`                                         | additive; independent of auth                          |
| P1       | Shared search ranking helper                                        | `packages/shared`                                     | foundation for command/skill search                    |
| P1       | `packages/client-runtime` parity layer                              | `packages/client-runtime`, `apps/web`, `apps/desktop` | audit duplication first                                |
| P2       | Shared QR code utility                                              | `packages/shared`, `apps/web`                         | used by pairing UX                                     |

---

## 4. Delivery waves

## Execution already started

The first execution slices have now started landing in the repo:

- shared auth contracts were ported into `packages/contracts/src/auth.ts`
- shared environment contracts were ported into `packages/contracts/src/environment.ts`
- contract tests were added so the roadmap can now auto-detect this feature family as complete in `/roadmap`
- shared search ranking was ported into `packages/shared/src/searchRanking.ts` with focused shared-package tests
- provider-skill search and presentation helpers were ported into `apps/web/src/providerSkillSearch.ts` and `apps/web/src/providerSkillPresentation.ts`
- window-controls overlay support was ported into `apps/web/src/lib/windowControlsOverlay.ts` and wired into web startup for Electron
- the command palette store, logic, UI shell, and bindings were ported into `apps/web/src/commandPaletteStore.ts` and `apps/web/src/components/CommandPalette*.tsx`
- desktop backend port, readiness, persistence, and exposure helpers were ported into `apps/desktop/src/backendPort.ts`, `backendReadiness.ts`, `desktopSettings.ts`, `clientPersistence.ts`, and `serverExposure.ts`
- a minimal `packages/client-runtime` package was restored with scoped-ref and known-environment helpers
- the shared QR code helper plus a reusable SVG renderer were ported into `packages/shared/src/qrCode.ts` and `apps/web/src/components/ui/qr-code.tsx`
- repository identity and GitHub pull-request helper ports were landed in `apps/server/src/project/Services/RepositoryIdentityResolver.ts`, `apps/server/src/project/Layers/RepositoryIdentityResolver.ts`, and `apps/server/src/git/githubPullRequests.ts`
- runtime-state persistence and orchestration HTTP helpers were landed in `apps/server/src/serverRuntimeState.ts`, `apps/server/src/orchestration/runtimeLayer.ts`, and `apps/server/src/orchestration/http.ts`
- auth bootstrap utility helpers were landed in `apps/server/src/startupAccess.ts`, `apps/server/src/cliAuthFormat.ts`, and `apps/server/src/auth/utils.ts`

### Wave 0 — program control and documentation

Already delivered in this repo:

- feature map document
- delivery plan document
- `/roadmap` realtime control-center UI
- interactive todo + subtask checklist
- live orchestration event feed
- scheduled-runbook documentation

### Wave 1 — low-risk foundations

1. auth/environment contracts
2. search ranking helper
3. shared QR code utility
4. desktop startup hardening helpers
5. additive server helper ports

### Wave 2 — additive UX ports

1. command palette
2. provider skill presentation
3. pairing route + connections UI
4. window controls overlay support

### Wave 3 — structural parity work

1. auth bootstrap and pairing control plane
2. multi-environment runtime model and routing
3. `packages/client-runtime` extraction/adoption

### Wave 4 — final convergence and hardening

1. integrate the above features together
2. remove duplicated local helper logic
3. expand integration coverage
4. rerun parity audit and update roadmap state

---

## 5. Detailed implementation plan by feature family

Each section includes:

- missing surface
- target implementation path
- validation plan
- sub-agent architecture
- completion criteria

---

### 5.1 Auth bootstrap, secret storage, and pairing control plane

**Priority:** P0  
**Primary status:** missing in Pi  
**Core upstream evidence:** `apps/server/src/auth/**`, `startupAccess.ts`, `cliAuthFormat.ts`, auth migrations

#### Missing surface

Pi does not yet have upstream's authenticated bootstrap path for pairing, credential storage, session redemption, or startup gating. That means any later pairing UX or multi-environment connection model would be incomplete without this backend foundation.

#### Implementation plan

1. Port auth-related schemas and persistence definitions first.
2. Add auth persistence services and migrations.
3. Add bootstrap credential generation and pairing redemption flows.
4. Introduce server startup/access gating in a way that does not break Pi runtime startup.
5. Expose only the minimal RPC/HTTP surface needed by web and desktop clients.
6. Keep provider/session runtime concerns decoupled from credential issuance.

#### Target files / areas

- `apps/server/src/auth/**`
- `apps/server/src/persistence/Migrations/**`
- `apps/server/src/persistence/Services/**`
- `apps/server/src/server.ts`
- `apps/server/src/ws.ts`
- `packages/contracts/src/auth.ts`

#### How to test

- server integration tests for issue/redeem/rotate/expire flows
- migration tests for restart safety
- startup access tests for unauthorized vs authorized connections
- regression tests that existing paired/local flows still work after restart

#### Sub-agent architecture

- **scout**: diff upstream auth files vs Pi runtime touchpoints; produce exact port inventory
- **planner**: break work into contracts, persistence, transport, gating, and UX dependencies
- **worker A**: port contracts + persistence schemas
- **worker B**: implement auth services + secret store + migrations
- **worker C**: wire startup gating and server transport after service tests pass
- **reviewer**: audit security boundaries, expiry rules, and recovery edge cases
- **verifier**: run fmt/lint/typecheck/test and restart/recovery checks

#### Completion criteria

- pairing/bootstrap secrets are persisted safely
- unauthorized clients are rejected predictably
- restart recovery preserves valid auth state
- existing Pi runtime startup remains intact

---

### 5.2 Shared auth and environment contracts

**Priority:** P0  
**Primary status:** missing in Pi  
**Core upstream evidence:** `packages/contracts/src/auth.ts`, `packages/contracts/src/environment.ts`

#### Missing surface

Pi lacks the schema-only contract layer required for auth, environment catalog, and connection flows.

#### Implementation plan

1. Port missing schemas directly into `packages/contracts`.
2. Keep the package schema-only.
3. Export the new contracts explicitly.
4. Update downstream consumers incrementally instead of mixing contract and implementation changes in one jump.

#### How to test

- schema decode/encode tests
- discriminated-union regression coverage
- cross-package typecheck for server/web/desktop consumers

#### Sub-agent architecture

- **scout**: compare upstream contract surface to current Pi gaps
- **planner**: define adoption order across packages
- **worker A**: port schemas and exports
- **worker B**: add contract tests
- **reviewer/verifier**: confirm package purity and validation coverage

#### Completion criteria

- auth/environment contracts exist in `packages/contracts`
- no runtime logic leaks into the contracts package
- downstream packages compile cleanly against the new contracts

---

### 5.3 Multi-environment runtime model and routing

**Priority:** P0  
**Primary status:** missing in Pi  
**Core upstream evidence:** `apps/web/src/environments/**`, `environmentApi.ts`, `localApi.ts`, environment-scoped routes

#### Missing surface

Pi is still fundamentally `threadId`-centric rather than `environmentId + threadId`-centric.

#### Implementation plan

1. Land environment contracts first.
2. Port environment catalog/runtime helpers.
3. Refactor route structure and selectors to be environment-aware.
4. Update RPC/native API adapters so environment context survives reconnects and resume.
5. Preserve local mode as the default additive rollout path.

#### Target files / areas

- `apps/web/src/routes/**`
- `apps/web/src/environments/**`
- `apps/web/src/lib/**`
- `apps/web/src/rpc/**`
- `apps/server/src/**` where environment ownership is enforced

#### How to test

- route tests for environment navigation
- store/selector tests for environment-scoped thread lookup
- reconnect/replay tests for environment changes
- manual validation across thread creation, diff view, terminal attach, and resume

#### Sub-agent architecture

- **scout**: inventory every `threadId`-only assumption in web/server code
- **planner**: stage contracts → route/store → transport → recovery
- **worker A**: contracts and environment catalog
- **worker B**: transport and API adapters
- **worker C**: route/store migration and UI adoption
- **reviewer**: validate deterministic recovery semantics
- **verifier**: run full web/server/rpc validation

#### Completion criteria

- environment-aware routes exist
- local mode remains stable
- reconnect/replay semantics remain predictable
- thread identity is environment-scoped everywhere it matters

---

### 5.4 Pairing route, QR flow, and connections settings UX

**Priority:** P0  
**Primary status:** missing in Pi  
**Core upstream evidence:** `pair.tsx`, `ConnectionsSettings.tsx`, `qr-code.tsx`, pairing UI components

#### Missing surface

There is no full browser-facing pairing and connections management UX in Pi today.

#### Implementation plan

1. Port route shell and QR display primitives.
2. Bind UI to server-auth/bootstrap transport.
3. Add connection management settings screens.
4. Handle offline, expired, invalid, and redeemed states explicitly.
5. Keep desktop and browser flows aligned.

#### How to test

- route tests for entry/redemption/redirect
- component tests for QR display and state transitions
- manual smoke tests for link copy, QR scan, revoke/remove connection

#### Sub-agent architecture

- **scout**: compare upstream pairing UX to current Pi navigation/settings surface
- **planner**: define the UX state machine and backend contract needs
- **worker A**: port pairing route and QR UI
- **worker B**: integrate settings and server calls
- **reviewer**: validate accessibility and failure-state clarity
- **verifier**: run web tests and regression checks

#### Completion criteria

- pairing route exists and is reachable
- connection state is server-authoritative
- expired and invalid states are user-actionable
- QR/link workflows work in browser and desktop contexts

---

### 5.5 Extensible command palette

**Priority:** P1  
**Primary status:** missing in Pi  
**Core upstream evidence:** `commandPaletteStore.ts`, `CommandPalette*.tsx`

#### Missing surface

Pi lacks upstream's keyboard-first extensible command palette.

#### Implementation plan

1. Port the command registry/store.
2. Port palette UI shell and keyboard entry points.
3. Register Pi actions first: roadmap, settings, new thread, archived threads, branch/worktree actions.
4. Add a Pi-specific extension point for later automation/provider actions.

#### How to test

- logic tests for ranking, registration, and visibility
- component tests for search and invocation
- manual regression with global shortcuts and focus traps

#### Sub-agent architecture

- **scout**: inventory existing shortcut/action surfaces
- **planner**: lock registry contract before UI binding work
- **worker A**: port store and core palette UI
- **worker B**: bind Pi actions and shortcuts
- **reviewer**: validate ergonomics and deduplication
- **verifier**: run web tests and full quality gates

#### Completion criteria

- palette opens predictably via keyboard
- core Pi actions are discoverable there
- ranking is shared and testable
- later Pi-only commands can plug in without custom menus

---

### 5.6 Provider skill discovery and presentation helpers

**Priority:** P2  
**Primary status:** missing in Pi  
**Core upstream evidence:** `providerSkillPresentation.ts`, `providerSkillSearch.ts`

#### Missing surface

Pi does not yet expose provider capabilities in a reusable, searchable way.

#### Implementation plan

1. Port skill search/presentation helpers.
2. Adopt shared ranking where possible.
3. Integrate into provider/model selection surfaces.
4. Keep all abstractions provider-neutral for Pi-only adapters.

#### How to test

- unit tests for search matching and labeling
- component tests for rendering in compact and expanded surfaces
- manual regression in composer-related UIs

#### Sub-agent architecture

- **scout**: identify metadata sources already present in Pi
- **planner**: define canonical presentation model
- **worker A**: port helpers
- **worker B**: integrate helper usage into UI
- **reviewer/verifier**: validate neutrality and behavior

#### Completion criteria

- provider skills can be searched and rendered consistently
- duplicated formatting/search logic is reduced
- UI remains compact and usable

---

### 5.7 Desktop backend readiness, port scanning, and persistence hardening

**Priority:** P1  
**Primary status:** missing in Pi  
**Core upstream evidence:** `backendPort.ts`, `backendReadiness.ts`, `desktopSettings.ts`, `clientPersistence.ts`, `serverExposure.ts`

#### Missing surface

Pi desktop is missing several upstream helpers that make startup predictable under port conflicts and slow backend boot.

#### Implementation plan

1. Port pure port-scan and readiness helpers.
2. Port desktop settings/persistence helpers.
3. Integrate into Electron startup and recovery flows.
4. Keep Pi-specific preload and update-state customizations intact.

#### How to test

- unit tests for port selection and readiness behavior
- smoke tests for cold start, stale port, slow start, and restart
- manual regression of preload/server exposure behavior

#### Sub-agent architecture

- **scout**: diff upstream helpers against current Pi desktop code
- **planner**: separate pure helpers from Electron glue
- **worker A**: port helper modules
- **worker B**: integrate them into startup/recovery
- **reviewer**: validate predictability and timeout behavior
- **verifier**: run desktop typecheck/smoke coverage

#### Completion criteria

- backend port selection is deterministic
- slow start no longer causes avoidable boot failures
- persisted desktop settings remain stable
- stale-port recovery behaves predictably

---

### 5.8 Window controls overlay support

**Priority:** P2  
**Primary status:** missing in Pi  
**Core upstream evidence:** `apps/web/src/lib/windowControlsOverlay.ts`

#### Missing surface

Pi lacks overlay-aware header/layout behavior for desktop window-control regions.

#### Implementation plan

1. Port overlay helper logic.
2. Update top-level headers and drag regions.
3. Guard desktop-only behavior so browser mode remains unchanged.

#### How to test

- helper tests for overlay detection/fallback
- layout tests for desktop headers
- manual cross-platform verification

#### Sub-agent architecture

- **scout**: inventory drag-region and titlebar assumptions
- **planner**: define a shared shell/layout contract
- **worker A**: port helper logic
- **worker B**: integrate header updates
- **reviewer/verifier**: confirm no browser regression

#### Completion criteria

- overlay-aware layout works where supported
- browser mode remains unaffected
- no dead drag regions are introduced

---

### 5.9 Server runtime state and orchestration HTTP surface

**Priority:** P1  
**Primary status:** missing in Pi  
**Core upstream evidence:** `orchestration/http.ts`, `runtimeLayer.ts`, `serverRuntimeState.ts`, `http.test.ts`

#### Missing surface

Pi lacks additive upstream runtime inspection helpers and orchestration HTTP glue.

#### Implementation plan

1. Port runtime state helpers.
2. Port additive HTTP handlers.
3. Reuse existing orchestration engine and projection services as the only source of truth.
4. Avoid creating duplicate read-model logic.

#### How to test

- server tests for snapshot/inspection behavior
- integration tests verifying HTTP state matches WebSocket-backed state
- manual startup/health inspection checks

#### Sub-agent architecture

- **scout**: map upstream handlers to current Pi startup composition
- **planner**: define the smallest safe additive HTTP surface
- **worker A**: port modules
- **worker B**: integrate server composition
- **reviewer/verifier**: confirm consistency with authoritative orchestration state

#### Completion criteria

- additive HTTP inspection surface exists
- responses stay consistent with existing orchestration state
- no duplicate state assembly paths are introduced

---

### 5.10 GitHub pull request and repository identity helpers

**Priority:** P1  
**Primary status:** missing in Pi  
**Core upstream evidence:** `git/githubPullRequests.ts`, `project/RepositoryIdentityResolver.ts`

#### Missing surface

Pi lacks isolated repo identity and PR lookup helpers needed for richer repo-aware UX.

#### Implementation plan

1. Port pure repository identity resolver.
2. Port GitHub PR lookup helper.
3. Expose them through explicit server boundaries.
4. Roll them into PR-aware UX later, after backend validation.

#### How to test

- unit tests for repo identity parsing
- integration tests for PR lookup using fixtures/mocks
- manual validation from branch/PR flows after adoption

#### Sub-agent architecture

- **scout**: inventory current branch/PR/repo touchpoints
- **planner**: keep git, GitHub, and UI boundaries explicit
- **worker A**: port repo identity helper
- **worker B**: port PR helper and server bindings
- **reviewer/verifier**: validate error handling and service seams

#### Completion criteria

- repo identity resolution is shared and tested
- PR lookup can be queried without coupling UI to git internals
- error paths are explicit and recoverable

---

### 5.11 Shared search ranking helper

**Priority:** P1  
**Primary status:** missing in Pi  
**Core upstream evidence:** `packages/shared/src/searchRanking.ts`

#### Missing surface

Pi does not yet have upstream's shared ranking helper for palette- and search-driven UX.

#### Implementation plan

1. Port shared ranking helper with explicit subpath exports.
2. Adopt it in command palette and provider skill search.
3. Prefer this shared helper over ad-hoc ranking logic going forward.

#### How to test

- shared-package unit tests for exact/prefix/token/fuzzy matches
- consumer-side tests in web logic
- export/typecheck validation

#### Sub-agent architecture

- **scout**: find duplicated search heuristics already in Pi
- **planner**: define canonical ranking contract
- **worker A**: port helper and tests
- **worker B**: adopt it in web search surfaces
- **reviewer/verifier**: validate package boundaries and behavior

#### Completion criteria

- shared search ranking helper exists
- first consumers use it
- ranking behavior is deterministic and covered by tests

---

### 5.12 `packages/client-runtime` parity layer

**Priority:** P1  
**Primary status:** missing in Pi  
**Core upstream evidence:** `packages/client-runtime/**`

#### Missing surface

Pi has no shared `client-runtime` package, which increases duplication risk across web and desktop bootstrap/runtime code.

#### Implementation plan

1. Audit what of upstream `client-runtime` is actually needed.
2. Extract a Pi-minimal package if a 1:1 port is not justified.
3. Keep exports narrow and explicit.
4. Migrate duplicated bootstrap/runtime helper usage to the new package.

#### How to test

- package-level tests for extracted helpers
- cross-package typecheck
- regression tests for moved bootstrap/runtime helpers

#### Sub-agent architecture

- **scout**: identify duplication across web and desktop
- **planner**: decide 1:1 upstream recreation vs Pi-minimal extraction
- **worker A**: create package and move first helpers
- **worker B**: update consumers incrementally
- **reviewer/verifier**: confirm maintainability improvement and validation coverage

#### Completion criteria

- duplicated bootstrap/runtime helper logic is reduced
- package boundaries remain tight
- web/desktop builds consume the package cleanly

---

### 5.13 Shared QR code utility

**Priority:** P2  
**Primary status:** missing in Pi  
**Core upstream evidence:** `packages/shared/src/qrCode.ts`

#### Missing surface

Pi currently lacks the shared QR helper required by pairing UX.

#### Implementation plan

1. Port or recreate a pure QR helper in `packages/shared`.
2. Export it explicitly via subpath.
3. Use it in pairing/connection-sharing UIs.
4. Keep rendering concerns out of the shared helper.

#### How to test

- deterministic helper tests
- component tests in consuming pairing UI
- shared export/typecheck coverage

#### Sub-agent architecture

- **scout**: inspect upstream helper surface and consumers
- **planner**: align helper boundary with actual pairing needs
- **worker A**: implement helper and export
- **worker B**: adopt it in web UI
- **reviewer/verifier**: validate deterministic output and consumer behavior

#### Completion criteria

- QR helper exists in `packages/shared`
- pairing UI consumes it instead of embedding QR logic locally
- outputs are deterministic and testable

---

## 6. Cross-feature dependency map

### Must land before most downstream work

- shared auth contracts
- shared environment contracts
- shared search ranking helper
- shared QR utility

### Strong dependencies

- pairing UI depends on auth backend and QR utility
- multi-environment routing depends on environment contracts
- provider skill discovery and command palette benefit from shared search ranking
- overlay support is safer after desktop hardening helpers land

### High-risk files to defer until late

- `apps/server/src/provider/**`
- `apps/server/src/codexAppServerManager.ts`
- `apps/server/src/server.ts`
- `apps/server/src/ws.ts`
- `apps/server/src/orchestration/**`
- `apps/server/src/terminal/**`

---

## 7. Test and validation standard

Every feature family should be considered incomplete until all of the following are true:

1. implementation code landed
2. targeted tests landed
3. docs updated
4. roadmap subtasks updated
5. full repo quality gates pass:
   - `bun fmt`
   - `bun lint`
   - `bun typecheck`
   - `bun run test`

If a feature is too large for one pass, it should still leave behind:

- updated roadmap subtasks
- updated remaining-risk notes
- explicit blockers in the runbook or delivery doc

---

## 8. Definition of done for the parity program

The parity program is done only when all of the following are true:

- the feature map no longer reports the major missing feature families above
- the roadmap UI checklist reflects completed work, not speculative plans
- auth, environment, pairing, command palette, and desktop hardening are all shipped
- Pi-specific runtime integration still works
- scheduled parity runs can be repeated using the runbook without rediscovering the process

---

## 9. What is already implemented in this repo

This repo already includes the program-management layer for executing the parity effort:

- `docs/t3code-feature-map.md`
- `docs/t3code-parity-delivery-plan.md`
- `docs/t3code-parity-scheduled-runbook.md`
- `/roadmap`
- roadmap live-event UI
- interactive roadmap checklist persistence

So the project now has:

- a parity snapshot
- a detailed implementation plan
- a scheduled operating process
- a live UI control center for tracking the work

The remaining execution is to port the actual upstream feature families in the order described above.
