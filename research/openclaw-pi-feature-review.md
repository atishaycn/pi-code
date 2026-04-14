# OpenClaw → Pi feature review

Date: 2026-04-13
OpenClaw source cloned to: `research/openclaw`
Upstream: `https://github.com/openclaw/openclaw`
Cloned commit: `891e42b` (`fix(ui): preserve user-selected session on reconnect and tab switch`)

## What I did

- Cloned the latest OpenClaw source into `research/openclaw`
- Read the main README plus the docs and architecture notes most relevant to Pi:
  - `research/openclaw/docs/pi.md`
  - `research/openclaw/docs/start/wizard.md`
  - `research/openclaw/docs/gateway/doctor.md`
  - `research/openclaw/docs/concepts/model-failover.md`
  - `research/openclaw/docs/web/control-ui.md`
  - `research/openclaw/docs/web/dashboard.md`
  - `research/openclaw/docs/tools/skills.md`
  - `research/openclaw/docs/concepts/session.md`
  - `research/openclaw/docs/concepts/presence.md`
  - `research/openclaw/docs/channels/broadcast-groups.md`
- Cross-checked Pi docs to separate "good fit for Pi core" from "better as extensions/examples":
  - `/Users/suns/Developer/pi-mono/packages/coding-agent/README.md`
  - `/Users/suns/Developer/pi-mono/packages/coding-agent/docs/sdk.md`
  - `/Users/suns/Developer/pi-mono/packages/coding-agent/docs/tui.md`
  - `/Users/suns/Developer/pi-mono/packages/coding-agent/docs/skills.md`
  - `/Users/suns/Developer/pi-mono/packages/coding-agent/docs/extensions.md`
  - `/Users/suns/Developer/pi-mono/packages/coding-agent/docs/models.md`

## Big picture

OpenClaw is interesting because it is not just "another agent app". It is one of the heaviest real-world Pi SDK integrations I could have looked at. The most valuable lessons are not the messaging-channel features themselves; they are the productized layers OpenClaw had to build around Pi to make Pi work reliably in a long-running, user-facing system.

The strongest themes are:

1. **Onboarding and repair UX matter a lot**
2. **Remote / embedded control surfaces need first-class session APIs**
3. **Auth/model failover needs to be operational, not just configurable**
4. **Skills need better discovery, gating, and installation ergonomics**
5. **Observability and recoverability are real product features**

---

## Best ideas for Pi core

## 1) A real `pi doctor` command

**Why it matters**
OpenClaw treats repair/migration/health-checking as a first-class product surface, not a README paragraph.

**What OpenClaw has**

- `openclaw doctor` does migration + repair + health checks
- interactive + non-interactive modes
- safe vs aggressive repair modes
- update-before-doctor flow for source installs
- config normalization, stale state cleanup, auth health checks, service checks, environment checks

**References**

- `research/openclaw/docs/gateway/doctor.md`
- `research/openclaw/docs/cli/doctor.md`

**What Pi could take from this**
A Pi-native `pi doctor` could check:

- provider auth presence / broken OAuth state
- broken `models.json` / incompatible custom provider definitions
- missing tool prerequisites (`git`, `rg`, `bun`, etc.)
- invalid extension / skill / prompt frontmatter and import errors
- stale sessions / corrupted transcript files
- terminal capability issues for TUI mode
- path / permission issues under `~/.pi`
- extension reload failures and package resolution failures

**Why this is core-worthy**
This directly improves the base Pi CLI and SDK developer experience, regardless of app-specific integrations.

## 2) Guided onboarding for auth + models + extensions + skills

**Why it matters**
OpenClaw’s onboarding is opinionated, staged, and practical. It reduces first-run failure dramatically.

**What OpenClaw has**

- `openclaw onboard`
- QuickStart vs Advanced paths
- setup flow for auth, workspace, daemon, channels, skills
- explicit reconfigure flows later

**References**

- `research/openclaw/docs/start/wizard.md`
- `research/openclaw/README.md`

**What Pi could take from this**
A `pi onboard` / `pi setup` flow could:

- detect installed providers and available auth paths
- guide OAuth/API key setup
- pick a default model and fallback model(s)
- optionally install starter skills/extensions/prompts/themes
- configure transport defaults and scoped models
- verify TUI compatibility and shell integration

**Why this is core-worthy**
Pi is already flexible; onboarding would make that flexibility usable.

## 3) Auth profile rotation + model failover as first-class runtime behavior

**Why it matters**
OpenClaw treats auth failure, rate limits, and billing exhaustion as runtime routing problems with cooldowns, stickiness, and state.

**What OpenClaw has**

- multiple auth profiles per provider
- session stickiness for a chosen profile
- cooldowns / disabled windows on failures
- model fallback chain when provider/profile fails
- persistent routing state

**References**

- `research/openclaw/docs/concepts/model-failover.md`
- `research/openclaw/docs/concepts/oauth.md`

**What Pi could take from this**
Pi already supports many providers, but it would benefit from:

- multiple auth identities per provider as a supported concept
- per-session auth-profile pinning
- automatic cooldown after rate-limit/auth failures
- fallback model chains in settings
- structured failure summaries rather than one opaque error

**Why this is core-worthy**
This is a runtime robustness feature, not an OpenClaw-specific app feature.

## 4) Better SDK/runtime APIs for persistent session overrides

**Why it matters**
OpenClaw’s browser UI patches live session state directly (`sessions.patch`) and depends heavily on session-level overrides for model/thinking/runtime behavior.

**What OpenClaw has**

- session listing and patching
- persistent per-session overrides
- multi-client coordination through gateway-owned session state

**References**

- `research/openclaw/docs/web/control-ui.md`
- `research/openclaw/docs/concepts/session.md`
- `research/openclaw/docs/pi.md`

**What Pi could take from this**
The Pi SDK would be much easier to embed if it exposed a cleaner, supported layer for:

- list sessions
- inspect active session metadata
- persist session-level model/thinking overrides
- patch session metadata without rebuilding the whole runtime
- subscribe to stable structured session events

**Why this is core-worthy**
This makes Pi significantly easier to embed into web apps, desktop apps, and orchestration servers.

## 5) A stronger, documented event model for embedded UIs

**Why it matters**
OpenClaw gets a lot of mileage from streaming tool events, assistant deltas, lifecycle boundaries, and abort state.

**What OpenClaw has**

- heavy use of `AgentSession` subscriptions
- bridging of lifecycle/tool/assistant events into its own UI and protocol
- block streaming and partial retention behaviors

**References**

- `research/openclaw/docs/pi.md`
- `research/openclaw/docs/web/control-ui.md`
- `research/openclaw/docs/concepts/streaming.md`

**What Pi could take from this**
Pi should make the embedded event surface more explicit and product-friendly:

- stable event taxonomy for SDK integrators
- clearer semantics around partial output, aborts, tool progress, compaction events
- examples for web streaming adapters
- helper utilities for translating session events into SSE/WebSocket feeds

**Why this is core-worthy**
OpenClaw is proof that Pi is already good enough to embed; Pi should package that story better.

## 6) Skills metadata, gating, and installability

**Why it matters**
OpenClaw turned skills from static prompt snippets into something operational: gated by env/config/binary availability, installable, and inspectable.

**What OpenClaw has**

- load-time gating via metadata (`requires.bins`, `requires.env`, `requires.config`, OS)
- install metadata for UI-driven setup
- explicit per-agent skill allowlists
- registry/install/update workflows

**References**

- `research/openclaw/docs/tools/skills.md`

**What Pi could take from this**
Pi skills could grow in three layers:

1. **metadata-only support in core**
   - requires env/bin/os
   - optional hidden/disabled state with reason
2. **UI/install hooks**
   - show missing prereqs
   - offer install commands or docs links
3. **registry later**
   - searchable community index, maybe external first

**Why this is core-worthy**
Pi already has skills; this makes them safer and much more usable.

## 7) A structured health/update flow for source installs

**Why it matters**
OpenClaw’s update and doctor story is cohesive: update, migrate, verify, restart.

**What OpenClaw has**

- `openclaw update`
- dashboard-triggered update RPC
- doctor-after-update safety pass

**References**

- `research/openclaw/docs/cli/update.md`
- `research/openclaw/docs/web/control-ui.md`
- `research/openclaw/docs/gateway/doctor.md`

**What Pi could take from this**
Pi could benefit from a supported maintenance story:

- detect installation type (npm/git/dev)
- run self-update where appropriate
- validate skills/extensions/models after update
- surface changelog + migration warnings in-product

**Why this is core-worthy**
This reduces breakage for power users and embedders.

---

## Best ideas for Pi examples / extension packages / companion apps

## 8) A reference web control UI built on the Pi SDK

**Why it matters**
OpenClaw’s Control UI shows how much value comes from a browser surface even when the core runtime is local.

**What OpenClaw has**

- browser dashboard
- live streaming chat
- session controls
- logs / config / skills / approvals / updates

**References**

- `research/openclaw/docs/web/control-ui.md`
- `research/openclaw/docs/web/dashboard.md`

**Recommendation for Pi**
This feels more like:

- an official SDK example
- or a separate `@mariozechner/pi-web` package
  than a core CLI feature.

A minimal version should include:

- live chat
- tool streaming
- model/thinking switch
- session picker
- extension/skill diagnostics

## 9) Presence / connected-clients view

**Why it matters**
OpenClaw tracks connected instances and device freshness. That is very useful once Pi is embedded into more than one UI/client.

**What OpenClaw has**

- best-effort presence entries
- instance IDs, TTL, dedupe rules
- UI instance list

**References**

- `research/openclaw/docs/concepts/presence.md`

**Recommendation for Pi**
Good fit for:

- RPC mode improvements
- a web/desktop companion example
- SDK utilities for client heartbeat/presence

Not necessary for the base terminal-only experience.

## 10) Device/browser pairing for remote UIs

**Why it matters**
OpenClaw treats browser/device access as a pairing problem, not just “paste a token somewhere”.

**What OpenClaw has**

- device pairing approvals
- remembered device identities
- tighter remote UI auth story

**References**

- `research/openclaw/docs/web/control-ui.md`
- `research/openclaw/docs/gateway/pairing.md`

**Recommendation for Pi**
Excellent for a future remote-control package or SDK example, but probably not Pi core unless Pi grows an official daemon/server mode.

## 11) Multi-agent fan-out / broadcast orchestration

**Why it matters**
OpenClaw’s broadcast groups are a practical pattern: multiple isolated agents react to the same input, each with its own tools/workspace/context.

**What OpenClaw has**

- same inbound message routed to multiple agents
- parallel or sequential execution
- isolated sessions and tool policies per agent

**References**

- `research/openclaw/docs/channels/broadcast-groups.md`

**Recommendation for Pi**
Given Pi’s current philosophy (“ships with powerful defaults but skips features like sub agents and plan mode”), this is probably better as:

- an SDK example
- an extension package
- or a separate orchestration library

Useful, but not obviously a core fit.

---

## The single most important OpenClaw lesson for Pi

**OpenClaw’s biggest contribution is not channels or mobile apps. It is that it productized Pi’s rough edges.**

Pi already looks strong in:

- extensibility
- TUI customization
- SDK embeddability
- session/tree mechanics

OpenClaw shows that the next layer of leverage is:

- onboarding
- repair/doctoring
- failover/auth resilience
- stable embedders’ APIs
- installable/gated skills
- admin/control surfaces

That is where Pi can get dramatically better without betraying its minimalist philosophy.

---

## Recommended priority order for Pi

### Highest value / lowest regret

1. `pi doctor`
2. `pi onboard` / guided setup
3. auth-profile rotation + model fallback
4. better persistent session/runtime APIs for embedders
5. richer skill metadata + gating

### Strong follow-up

6. official web UI SDK example
7. structured event-stream helpers for web/socket integrations
8. install/update health flow

### Probably separate package, not core

9. presence / instances
10. remote device pairing
11. multi-agent broadcast / orchestration

---

## Concrete implementation ideas for Pi

### A. `pi doctor` MVP

- `pi doctor`
- `pi doctor --fix`
- checks:
  - provider auth and login state
  - custom models schema
  - broken extension imports
  - duplicate/broken skills
  - session file integrity
  - missing shell tools
  - terminal feature support

### B. `pi onboard` MVP

- auth provider selection
- model selection
- fallback model selection
- choose starter extension pack / skills pack
- verify shell + TUI support
- generate `~/.pi/agent/settings.json`

### C. runtime/session SDK improvements

- `runtime.listSessions()`
- `runtime.getSessionMetadata(id)`
- `runtime.patchSession(id, patch)`
- stable typed event adapters for SSE / WS
- explicit partial/abort/final event helpers

### D. skills v2 metadata

- `requires.bins`
- `requires.env`
- `requires.os`
- `primaryEnv`
- disabled-with-reason support in UI/commands

---

## Bottom line

If we want to learn from OpenClaw without turning Pi into OpenClaw, the right move is:

- copy **operational UX** from OpenClaw,
- copy **embedder ergonomics** from OpenClaw,
- copy **skills/installability ideas** from OpenClaw,
- do **not** copy the app-specific channel/platform surface into Pi core.

That would make Pi materially stronger while keeping its identity intact.
