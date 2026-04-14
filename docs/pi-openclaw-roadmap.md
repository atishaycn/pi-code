# Pi roadmap inspired by OpenClaw

Date: 2026-04-13
Context: follow-up to `research/openclaw-pi-feature-review.md`

## Thesis

Pi should learn from OpenClaw in the places where OpenClaw had to harden Pi for **coding workflows** and **autonomous agent runtimes**.

That means the target is **not**:

- chat-channel sprawl
- mobile companion app sprawl
- generic assistant-product features that are unrelated to coding

The target **is**:

- more reliable autonomous execution
- better embedder APIs for agentic systems
- safer long-running sessions
- better repair and onboarding UX
- more operational skills/extensions
- better observability of agent behavior

Put differently:

> OpenClaw is valuable here because it is a production stress test of Pi as an embedded coding-agent runtime.

---

## Product guardrails

Any feature we take from OpenClaw should satisfy at least one of these:

1. **Makes Pi better at coding work**
   - repo understanding
   - editing loops
   - tool execution
   - verification
   - iterative implementation

2. **Makes Pi better at autonomous agent operation**
   - safe unattended runs
   - recoverability after failure
   - queueing, aborting, retrying
   - session persistence and consistency
   - model/auth resilience

3. **Makes Pi easier to embed into coding products**
   - web UIs
   - orchestration systems
   - background runners
   - multi-client control surfaces

If it does none of those, it probably belongs in a separate package or not at all.

---

## Tier 1: high-priority Pi core work

## 1) `pi doctor`

### Why this matters for coding + autonomous agents

Pi is increasingly used in messy real environments:

- source installs
- custom models
- local providers
- OAuth + API key mixes
- project skills/extensions
- long-lived session files
- embedded SDK integrations

Autonomous agent reliability suffers badly when state silently drifts.

### What to build

A first-class `pi doctor` command with:

- `pi doctor`
- `pi doctor --fix`
- `pi doctor --json`
- `pi doctor --non-interactive`

### Checks to include

#### Auth/model checks

- configured providers that are missing credentials
- broken OAuth cache / expired login state
- malformed `models.json`
- custom provider/model schema mismatches
- unavailable local-model endpoints (`ollama`, `lmstudio`, etc.)

#### Runtime checks

- invalid `settings.json`
- invalid extensions (load/import errors)
- invalid skills (frontmatter, duplicate names, broken paths)
- invalid prompt templates / packages
- session file corruption or inconsistent headers
- missing tool dependencies (`git`, `rg`, `bash`, `node`, `bun` where relevant)

#### TUI/platform checks

- unsupported terminal capabilities
- broken clipboard/image support where detectable
- bad shell setup / path problems

### Why it is core

This is universal value for coding users and autonomous embedders.

### Suggested rollout

- **MVP**: read-only diagnostics
- **Phase 2**: safe automatic fixes
- **Phase 3**: doctor hooks so extensions can contribute checks

---

## 2) `pi onboard` / `pi setup`

### Why this matters for coding + autonomous agents

OpenClaw’s biggest product win is reducing setup failure. Pi has lots of power, but it still assumes a pretty competent operator.

For coding-agent use, the best setup path should quickly get the user to:

- a working model
- a verified tool-capable environment
- sane defaults for code editing
- optional starter packs for skills/extensions

### What to build

A guided setup command:

- `pi onboard`
- `pi setup`

### Scope

- detect available auth methods
- guide `/login` or API-key setup
- pick a default coding model
- pick one or more fallback models
- configure model cycling / scoped models
- verify terminal/TUI support
- optionally install starter coding skills
- optionally install starter safety extensions
- write baseline `~/.pi/agent/settings.json`

### Coding-focused presets

Offer presets like:

- **Minimal coding CLI**
- **Autonomous coding agent**
- **Embedded SDK app developer**

### Why it is core

This directly improves first-run success for Pi’s actual use case: coding.

---

## 3) Auth profile rotation + model failover

### Why this matters for coding + autonomous agents

Autonomous coding agents fail for boring reasons all the time:

- provider rate limits
- expired OAuth
- overloaded provider backends
- broken custom endpoints
- temporary auth failures

OpenClaw built serious runtime handling here because long-running agent systems need it.

### What Pi should support

#### Auth profiles as a first-class concept

Per provider, allow multiple auth identities:

- API key
- OAuth identity
- maybe command/env-backed credentials

#### Runtime behavior

- session-level auth-profile pinning
- cooldown after rate-limit or transient auth/provider errors
- disabled windows for persistent billing/credit failures
- fallback to another auth profile first
- then fallback to another model
- structured error summaries after all attempts fail

#### Settings/API surface

Potential config shape:

- primary model
- fallback models[]
- auth profiles by provider
- auth profile preference order
- cooldown policy

### Why it is core

This directly improves autonomous reliability. It is one of the strongest coding-agent features we can take from OpenClaw.

### Important design constraint

Keep the default experience simple:

- single-auth users should not see complexity unless they opt in
- failover should be visible and inspectable, not magical

---

## 4) Better session/runtime control APIs for embedders

### Why this matters for coding + autonomous agents

OpenClaw leaned hard on runtime-owned session state. That is a strong signal.

Pi is already embeddable, but serious products need cleaner control over:

- session enumeration
- session metadata
- persistent overrides
- live streaming state
- abort/retry behavior

### What Pi should add

#### Runtime APIs

- `listSessions()`
- `getSession(sessionId)`
- `patchSession(sessionId, patch)`
- `deleteSession(sessionId)`
- `getActiveRun(sessionId)`
- `abortRun(sessionId | runId)`

#### Session override support

Persistent per-session overrides for:

- model
- thinking level
- maybe output mode / verbosity
- maybe sandbox/tool policy selection where applicable

#### Stable metadata structure

Include fields like:

- session id / file / cwd
- last activity
- current model
- current overrides
- streaming state
- token/cost stats if available

### Why it is core

A lot of future Pi growth will happen through embedded coding products, not just the terminal app.

---

## 5) A stronger event model for embedded autonomous runtimes

### Why this matters

Autonomous agent systems need a stable stream of what is happening, not just final text.

OpenClaw clearly depends on:

- assistant deltas
- tool start/update/end
- run lifecycle boundaries
- compaction lifecycle
- abort semantics

### What Pi should do

Define and document a more stable event taxonomy for embedders.

### Minimum event families

- run start / run end
- turn start / turn end
- message delta / message final
- thinking delta / reasoning block start/end
- tool call start / progress / end
- compaction start / end
- abort requested / abort complete
- queue state changes
- error / failover events

### Helpers worth shipping

- SSE adapter helper
- WebSocket adapter helper
- event-to-JSON schema types
- reference web-stream example

### Why it is core

Autonomous coding agents are operational systems. Operational systems need good event surfaces.

---

## 6) Skills v2: metadata, gating, and install readiness

### Why this matters for coding + autonomous agents

Pi skills are powerful, but today they are mostly prompt assets. OpenClaw shows they can be much more operational.

For coding-agent use, this matters because many useful skills need:

- binaries installed
- API keys available
- platform compatibility
- setup docs or install commands

### What Pi should add

#### Skill metadata gates

Support in `SKILL.md` metadata:

- required binaries
- required env vars
- supported OS list
- optional install instructions / homepage
- hidden/disabled reasons

#### Runtime behavior

- detect and mark skills as unavailable instead of silently exposing broken ones
- show why a skill is unavailable in `/skills` or model picker UI
- optionally omit disabled skills from the prompt while still listing them in UX

#### Install ergonomics

Not necessarily a registry first. Start with:

- skill health reporting
- installer hints
- project/global skill status views

### Why it is core

This directly helps coding workflows where skills wrap real developer tools.

---

## Tier 2: near-core or official examples/packages

## 7) Official web UI reference for Pi SDK

### Why this matters

OpenClaw demonstrates that Pi is already good enough to power a browser control surface. Pi should make that easier to copy.

### What to build

An official reference app, likely **not inside core CLI**:

- chat view with streaming
- tool cards / tool output
- model + thinking selectors
- session picker
- abort button
- diagnostics panel

### Why it matters for coding/autonomy

This would become the fastest way to build:

- internal coding copilots
- remote coding harnesses
- background task consoles
- session inspectors

### Recommendation

Ship as:

- `examples/sdk/web-ui`
- or `@mariozechner/pi-web`

Not core CLI.

---

## 8) Update/maintenance workflow for source installs

### Why this matters

Power users of coding tools often install from git, run custom builds, and carry local extensions. Those setups break in non-obvious ways.

### What to build

- `pi update` where appropriate
- install-type detection
- post-update doctor pass
- migration notes surfaced in CLI
- maybe versioned compatibility checks for extensions/skills

### Why it matters for coding/autonomy

Fewer broken unattended runners after upgrades.

---

## 9) Extension/skill diagnostics API

### Why this matters

Autonomous systems need to know not just that a skill exists, but whether it is actually usable.

### What to build

Expose machine-readable diagnostics for:

- extension load status
- skill health and gating reasons
- package resolution
- command registration collisions

### Why it matters

Great for both `pi doctor` and any embedded control UI.

---

## Tier 3: useful, but probably separate packages or later work

## 10) Presence / instances / multi-client observability

### Why it matters

Once Pi runs inside a service or shared UI, it is useful to know:

- who is connected
- what client is active
- which session is being viewed

### Recommendation

Useful for SDK products, not a terminal-core priority.

Build later as:

- an SDK helper
- a web UI feature
- or a daemon-mode package

---

## 11) Pairing / device trust for remote UIs

### Why it matters

If Pi gets an official remote server mode, remote browser/device trust becomes important.

### Recommendation

Do **not** pull this into core prematurely.

It only becomes relevant if Pi grows:

- a persistent local/remote server process
- an official browser control surface
- device-specific auth

Until then, keep this out of the critical path.

---

## 12) Multi-agent fan-out / broadcast orchestration

### Why this matters

This can be useful for autonomous coding systems:

- parallel review agents
- security + tests + docs pass in parallel
- compare multiple model/tool strategies

### Recommendation

This is interesting, but it conflicts with Pi’s current minimalist philosophy if forced into core.

Best fit:

- SDK example
- extension package
- orchestration library above Pi

Pi should stay a strong runtime substrate first.

---

## Concrete implementation sequence

## Phase 1: reliability baseline

1. `pi doctor` MVP
2. extension/skill/model diagnostics plumbing
3. skills v2 metadata/gating

### Success criteria

- users can diagnose broken installs fast
- autonomous runners fail with actionable errors
- broken skills/extensions stop being mystery failures

---

## Phase 2: setup and resilience

4. `pi onboard`
5. auth profiles + cooldowns
6. model fallback chains

### Success criteria

- first-run setup becomes much smoother
- unattended coding runs survive transient provider failures
- users can intentionally configure resilient model routing

---

## Phase 3: embedders’ platform

7. session patch/list APIs
8. stable event model
9. SSE/WS adapter helpers
10. official web reference UI

### Success criteria

- Pi becomes much easier to embed into coding products
- fewer bespoke adapters like the ones OpenClaw had to build
- remote/autonomous coding consoles become straightforward to implement

---

## Feature mapping: OpenClaw idea → Pi destination

| OpenClaw idea                         | Best destination in Pi                |
| ------------------------------------- | ------------------------------------- |
| `doctor`                              | core CLI + extensible diagnostics API |
| onboarding wizard                     | core CLI                              |
| auth profile rotation                 | core runtime                          |
| model failover                        | core runtime                          |
| session patching                      | SDK/runtime core                      |
| streaming event bridge                | SDK/runtime core                      |
| skills gating/install metadata        | core skills system                    |
| control UI                            | official example or separate package  |
| presence                              | web/daemon package later              |
| pairing                               | remote-server package later           |
| broadcast groups / multi-agent fanout | orchestration layer / example         |

---

## Anti-goals

To keep Pi focused on coding + autonomous agents, we should explicitly avoid over-copying OpenClaw.

### Do not import into Pi core

- messaging channel integrations
- mobile node/device features
- broad personal-assistant product surfaces
- daemon-first architecture unless needed for coding workflows
- remote trust/pairing complexity before there is a real server-mode need

### Do not compromise simplicity

- single-user defaults should remain easy
- advanced failover should be opt-in
- embedder APIs should be stable and minimal, not sprawling

---

## Recommended final priority order

### Must-do

1. `pi doctor`
2. diagnostics plumbing for models/extensions/skills/sessions
3. skills metadata + gating
4. auth profile rotation + model fallback
5. `pi onboard`

### Should-do

6. session patch/list APIs
7. stronger runtime event model
8. official web control example
9. update/maintenance flow

### Nice-to-have, probably outside core

10. presence / instances
11. pairing / device trust
12. multi-agent fan-out orchestration

---

## Bottom line

If we keep Pi centered on **coding** and **autonomous agent execution**, then the best lessons from OpenClaw are:

- make Pi easier to set up
- make Pi easier to repair
- make Pi much more resilient under provider failure
- make Pi much easier to embed cleanly
- make skills operational rather than decorative

That is the right abstraction lift.

It strengthens Pi as a coding-agent runtime without turning Pi into a general-purpose assistant platform.
