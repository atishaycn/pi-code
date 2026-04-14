# Pi implementation backlog from OpenClaw learnings

Date: 2026-04-13
Related docs:

- `research/openclaw-pi-feature-review.md`
- `docs/pi-openclaw-roadmap.md`

Scope note: this backlog is explicitly filtered for **Pi as a coding harness** and **Pi as a runtime for autonomous coding agents**.

It is **not** a plan to turn Pi into OpenClaw.

---

## Goals

This backlog focuses on four outcomes:

1. **Make Pi easier to get working correctly**
2. **Make Pi more reliable under autonomous operation**
3. **Make Pi easier to embed into coding products**
4. **Make skills/extensions more operational and diagnosable**

---

## Workstreams

1. **Diagnostics & Repair**
2. **Setup & Onboarding**
3. **Runtime Resilience**
4. **Session / Embedder APIs**
5. **Operational Skills**
6. **Reference Surfaces**

---

# Workstream 1: Diagnostics & Repair

## Epic 1.1 — `pi doctor` MVP

### Outcome

Users and embedders can quickly detect broken Pi installs and broken runtime state.

### User-facing commands

- `pi doctor`
- `pi doctor --json`
- `pi doctor --non-interactive`
- later: `pi doctor --fix`

### Functional requirements

#### Read-only diagnostics

- validate `settings.json`
- validate `models.json`
- validate extension discovery and loadability
- validate skill discovery and frontmatter
- validate prompt templates and themes
- detect missing common coding tools (`git`, `rg`, shell availability)
- detect session file corruption / migration needs
- detect likely terminal capability issues for TUI mode
- report auth availability by provider

#### Output modes

- human-readable CLI summary
- machine-readable JSON for SDKs, CI, wrappers, and app embedders

### Proposed API/types

Add a diagnostics subsystem with types roughly like:

```ts
export interface PiDiagnostic {
  id: string;
  category:
    | "settings"
    | "models"
    | "auth"
    | "extensions"
    | "skills"
    | "sessions"
    | "tools"
    | "terminal";
  severity: "info" | "warning" | "error";
  summary: string;
  detail?: string;
  fixable?: boolean;
  fixHint?: string;
  filePaths?: string[];
}
```

```ts
export interface DoctorReport {
  ok: boolean;
  diagnostics: PiDiagnostic[];
}
```

### Rough file impact areas in `pi-mono`

Likely new files:

- `packages/coding-agent/src/core/doctor.ts`
- `packages/coding-agent/src/core/doctor-types.ts`
- `packages/coding-agent/src/core/doctor-checks/*`

Likely touched files:

- `packages/coding-agent/src/cli/args.ts`
- main CLI entrypoint for subcommand wiring
- `packages/coding-agent/src/core/extensions/*`
- `packages/coding-agent/src/core/session-manager.ts`
- model/settings loading code
- docs:
  - `packages/coding-agent/README.md`
  - `packages/coding-agent/docs/development.md`
  - new `packages/coding-agent/docs/doctor.md`

### Milestone slice

- M1: diagnostics core + JSON output
- M2: CLI human output
- M3: extension/skill/session checks

---

## Epic 1.2 — `pi doctor --fix`

### Outcome

Pi can safely repair common drift without manual surgery.

### Candidate fixes

- rewrite malformed-but-recoverable settings files
- normalize or migrate old session metadata versions
- prune obviously invalid resource references
- mark bad extensions/skills with precise reasons
- install/update shell completion if Pi has one

### Guardrails

- default to safe fixes only
- never destroy session data silently
- write backups before mutating persisted state

### Rough file impact

- same as Epic 1.1 plus session migration helpers in:
  - `packages/coding-agent/src/core/session-manager.ts`

---

## Epic 1.3 — extensible doctor hooks

### Outcome

Extensions can contribute diagnostics for their own runtime assumptions.

### Proposed extension API

Something like:

```ts
pi.registerDoctorCheck({
  id: "my-extension/config",
  async run(ctx) {
    return [{ ...diagnostic }];
  },
});
```

### Why this matters

Autonomous coding stacks often rely on custom extensions. Core doctor alone will never know enough.

### Rough file impact

- `packages/coding-agent/src/core/extensions/types.ts`
- `packages/coding-agent/src/core/extensions/runner.ts`
- doctor core implementation
- docs/extensions.md

---

# Workstream 2: Setup & Onboarding

## Epic 2.1 — `pi onboard`

### Outcome

A new user can get a working coding-agent environment with much fewer manual steps.

### User-facing commands

- `pi onboard`
- maybe alias: `pi setup`

### Functional requirements

- detect available providers and auth paths
- guide login / API-key setup
- choose a default coding model
- choose optional fallback models
- configure scoped model cycling
- verify tool/runtime prerequisites for coding
- optionally enable recommended coding skills/extensions
- write a baseline settings file

### Coding-focused presets

- **Quick coding setup**
- **Autonomous coding agent**
- **SDK/embedder developer**

### Rough file impact

Likely new files:

- `packages/coding-agent/src/cli/onboard.ts`
- `packages/coding-agent/src/core/onboard/*`

Likely touched files:

- `packages/coding-agent/src/cli/args.ts`
- interactive components under:
  - `packages/coding-agent/src/modes/interactive/components/*`
- provider/auth docs
- settings docs

### Milestones

- M1: non-interactive config generator
- M2: interactive wizard in TUI
- M3: starter packs for skills/extensions

---

## Epic 2.2 — onboarding health verification

### Outcome

Onboarding ends with validation, not hope.

### Requirements

At the end of setup:

- verify chosen model is available
- verify auth is usable
- verify required tools are available
- optionally run a tiny dry-run prompt

### Rough file impact

- onboarding subsystem
- diagnostics subsystem reuse

---

# Workstream 3: Runtime Resilience

## Epic 3.1 — auth profiles as a first-class concept

### Outcome

Pi can manage more than one credential identity per provider for robust autonomous runs.

### Functional requirements

- store multiple auth profiles per provider
- support OAuth and API key profiles
- allow profile preference ordering
- expose current active profile to runtime/session state

### Proposed data model

Something in spirit like:

```ts
interface AuthProfile {
  id: string;
  provider: string;
  type: "oauth" | "api_key";
  label?: string;
}

interface AuthProfileState {
  lastUsed?: number;
  cooldownUntil?: number;
  disabledUntil?: number;
  errorCount?: number;
}
```

### Rough file impact

Likely touched/new areas:

- auth storage implementation
- model registry / provider selection code
- session runtime creation path
- docs/providers.md
- docs/sdk.md

Because exact auth files were not fully inspected here, expect this to touch provider/auth internals across `packages/coding-agent` plus sibling packages in `pi-mono`.

---

## Epic 3.2 — cooldowns and retry classification

### Outcome

Transient provider failures stop killing autonomous coding runs immediately.

### Requirements

- classify retryable failures vs fatal failures
- cooldown bad auth profiles after rate-limit/transient auth errors
- keep simple defaults for single-profile users

### Proposed behavior

1. try current profile
2. rotate to another viable profile on retryable failure
3. if provider exhausted, move to fallback model
4. emit structured summary when all attempts fail

### Rough file impact

- provider request path
- agent runtime prompt execution path
- event model for failover reporting
- docs/providers.md
- docs/sdk.md

---

## Epic 3.3 — model fallback chains

### Outcome

Autonomous coding runs survive temporary provider/model failures.

### Functional requirements

- define ordered fallback models
- persist session-level selected fallback state where appropriate
- expose current active model vs fallback reason

### Proposed user surface

Possible settings shape:

```json
{
  "model": "anthropic/claude-sonnet-4",
  "fallbackModels": ["openai/gpt-5", "google/gemini-2.5-pro"]
}
```

or a richer per-profile/provider format later.

### Rough file impact

- model selection logic
- session state model-change handling
- `src/core/agent-session-runtime.ts`
- `src/core/session-manager.ts`
- model selector UI components
- docs/models.md

---

## Epic 3.4 — failure summaries for autonomous runs

### Outcome

When a run fails, users and systems understand why.

### Requirements

Return structured detail like:

- attempted provider/model/profile combinations
- error class per attempt
- cooldown windows if applicable
- final failure reason

### Rough file impact

- event system
- SDK types
- RPC types
- print/json mode output

Likely touched:

- `packages/coding-agent/src/modes/rpc/rpc-types.ts`
- runtime/session event typing
- docs/rpc.md
- docs/sdk.md

---

# Workstream 4: Session / Embedder APIs

## Epic 4.1 — runtime session listing and inspection APIs

### Outcome

Embedders can manage sessions without reverse-engineering session files.

### Existing nearby surface

Current runtime/session infrastructure already exists in:

- `packages/coding-agent/src/core/agent-session-runtime.ts`
- `packages/coding-agent/src/core/session-manager.ts`
- RPC session commands in `packages/coding-agent/src/modes/rpc/rpc-types.ts`

### What to add

To runtime/SDK:

- `listSessions()`
- `getSessionInfo(sessionPath | sessionId)`
- `getSessionMetadata(...)`
- maybe `listActiveRuns()`

### Proposed API shape

```ts
interface SessionMetadata {
  sessionId: string;
  sessionFile?: string;
  cwd: string;
  name?: string;
  modelOverride?: { provider: string; modelId: string };
  thinkingOverride?: string;
  isStreaming?: boolean;
  lastModified?: string;
}
```

### Rough file impact

- `packages/coding-agent/src/core/agent-session-runtime.ts`
- `packages/coding-agent/src/core/session-manager.ts`
- exports in `packages/coding-agent/src/core/index.ts`
- docs/sdk.md

---

## Epic 4.2 — session patch API

### Outcome

Embedders can persist session overrides without rebuilding the runtime every time.

### Requirements

Patchable fields should probably start small:

- session display name
- model override
- thinking override
- maybe queue mode overrides

### Proposed API

```ts
runtime.patchSession(sessionId, {
  name,
  modelOverride,
  thinkingLevel,
});
```

### RPC alignment

Potential RPC commands:

- `get_session_metadata`
- `patch_session`

### Rough file impact

- `packages/coding-agent/src/core/agent-session-runtime.ts`
- `packages/coding-agent/src/core/session-manager.ts`
- `packages/coding-agent/src/modes/rpc/rpc-types.ts`
- `packages/coding-agent/docs/rpc.md`
- interactive UI components for model/thinking/session selection

---

## Epic 4.3 — stable runtime event taxonomy

### Outcome

Embedders can build robust UIs and orchestration systems on Pi without custom ad-hoc event translation.

### Existing nearby surface

Pi already exposes rich session events via `AgentSession` and extension hooks.

### What to formalize

Document and stabilize event families for:

- run lifecycle
- turn lifecycle
- assistant delta/final
- tool start/update/end
- compaction start/end
- abort requested/completed
- retry/failover
- queue state changes

### Deliverables

- typed event schema
- docs/sdk.md additions
- docs/rpc.md alignment
- migration notes if needed

### Rough file impact

- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/index.ts`
- `packages/coding-agent/src/modes/rpc/rpc-types.ts`
- docs/sdk.md
- docs/rpc.md

---

## Epic 4.4 — SSE / WebSocket adapter helpers

### Outcome

Pi becomes much easier to expose through web apps and remote coding consoles.

### Deliverables

A small helper layer that converts session events to serializable envelopes for:

- SSE
- WebSocket

### Recommendation

This can live as either:

- core SDK helper utilities, or
- a small official companion package

### Rough file impact

Likely new area:

- `packages/coding-agent/src/core/stream-adapters/*`

Docs/examples:

- `packages/coding-agent/docs/sdk.md`
- `packages/coding-agent/examples/sdk/*`

---

# Workstream 5: Operational Skills

## Epic 5.1 — skill metadata gates

### Outcome

Pi can distinguish between available and unavailable skills in a coding-aware way.

### What to add

Support metadata such as:

- required binaries
- required env vars
- supported OS
- optional homepage/docs link
- install hint metadata

### Example target shape

```yaml
metadata:
  pi:
    requires:
      bins: ["uv", "jq"]
      env: ["GITHUB_TOKEN"]
      os: ["darwin", "linux"]
```

### Runtime behavior

- unavailable skills are visible in diagnostics/UI
- unavailable skills can be hidden from model prompt
- slash-command UX can show reason when invocation fails

### Rough file impact

Likely touched:

- skill discovery/validation/loading code
- command discovery code
- interactive settings / skill UI
- docs/skills.md
- docs/extensions.md if extensions need access to gating info

---

## Epic 5.2 — skill health reporting

### Outcome

Users can inspect skill readiness without reading random files.

### User-facing surfaces

- `/skills` or equivalent UI enhancements
- `pi doctor`
- maybe RPC/SDK `get_skills` diagnostics API

### Output should include

- discovered skill name
- source path
- enabled/disabled state
- hidden from model or not
- missing prereqs
- collision/override status

### Rough file impact

- skill subsystem
- interactive components
- doctor diagnostics
- rpc types if exposed remotely

---

## Epic 5.3 — install hints and starter packs

### Outcome

Useful coding skills become much easier to adopt.

### Scope

Not necessarily a registry yet. Start with:

- homepage/docs link metadata
- install command hints
- curated starter packs enabled by `pi onboard`

### Candidate starter packs

- git / GitHub workflow
- test-running helpers
- docs / changelog helpers
- release / versioning helpers

### Rough file impact

- onboarding
- skills metadata/docs
- maybe package docs

---

# Workstream 6: Reference Surfaces

## Epic 6.1 — official web control example

### Outcome

Pi has a canonical browser-based embedder example for coding-agent use.

### Why it matters

OpenClaw proved that the missing piece is not raw capability; it is packaging.

### Recommended scope

A reference app with:

- chat log
- tool streaming cards
- model selector
- thinking selector
- session picker
- abort button
- diagnostics pane

### Recommendation

Ship as example or companion package, not core CLI.

### Rough file impact

Likely outside the current package core, but should include:

- `packages/coding-agent/examples/sdk/web-ui/*`
- docs/sdk.md

---

## Epic 6.2 — update/maintenance flow

### Outcome

Source installs and power-user setups are less fragile.

### Possible user-facing commands

- `pi update`
- or smaller-scope `pi doctor --suggest-update`

### Scope

- detect install type
- guide update steps
- run doctor after update
- report extension/package incompatibility warnings

### Rough file impact

- CLI subcommand wiring
- package/source inspection helpers
- docs/development.md
- README.md

---

# Milestones

## Milestone A — reliability foundation

### Includes

- Epic 1.1 `pi doctor` MVP
- Epic 5.1 skill metadata gates
- Epic 5.2 skill health reporting

### Why this first

It gives immediate value to both interactive coding users and autonomous embedders.

### Acceptance criteria

- `pi doctor` reports useful structured diagnostics
- broken skills are no longer silent footguns
- diagnostics can be consumed programmatically

---

## Milestone B — autonomous resilience

### Includes

- Epic 3.1 auth profiles
- Epic 3.2 cooldowns/retry classification
- Epic 3.3 model fallback chains
- Epic 3.4 failure summaries

### Acceptance criteria

- autonomous runs can survive transient provider failures
- users can inspect why fallback happened
- single-provider/single-auth users still get a simple UX

---

## Milestone C — setup and embedders

### Includes

- Epic 2.1 `pi onboard`
- Epic 2.2 onboarding verification
- Epic 4.1 session listing APIs
- Epic 4.2 session patch API
- Epic 4.3 stable event taxonomy

### Acceptance criteria

- first-run setup is substantially easier
- embedded apps can manage sessions without poking internal files
- event semantics are documented and stable enough for web UIs

---

## Milestone D — official examples/surfaces

### Includes

- Epic 4.4 SSE/WS adapters
- Epic 6.1 web control example
- Epic 6.2 update/maintenance flow

### Acceptance criteria

- Pi has a canonical web embed story
- fewer product teams need to invent their own adapters
- source installs are less painful to maintain

---

# Suggested issue breakdown

## Very small / starter issues

- add doctor report types
- add settings validator diagnostic
- add models.json validator diagnostic
- add session file integrity scanner
- add skill metadata parser for `requires.bins`
- add skill metadata parser for `requires.env`
- add JSON output mode for doctor

## Medium issues

- implement `pi doctor` command
- implement skill health status view
- implement fallback-model selection config
- implement session metadata getter APIs
- implement session patch RPC command
- document stable SDK event families

## Larger issues

- auth profile persistence and routing
- retry/failover runtime logic
- onboarding wizard
- official web reference app

---

# Risks and constraints

## 1) Avoid over-complexifying the default Pi UX

Mitigation:

- advanced runtime resilience should be opt-in or progressively disclosed
- single-user/single-model usage must stay straightforward

## 2) Avoid hard-coding app-specific assumptions

Mitigation:

- keep APIs generic to coding-agent operation
- push product-specific orchestration into examples/packages

## 3) Avoid leaking unstable internal semantics into public SDKs too early

Mitigation:

- stabilize a small event/session surface first
- clearly separate public API from internal helper layers

## 4) Avoid skill metadata becoming a second package manager

Mitigation:

- start with diagnostics and gating
- postpone registry complexity

---

# Recommended next implementation order

1. add diagnostics types + `pi doctor` skeleton
2. add settings/models/session/skill diagnostics
3. add skill gating metadata
4. add skill health UI/reporting
5. add auth profile abstractions
6. add fallback/cooldown runtime behavior
7. add session metadata APIs
8. add session patch APIs
9. add onboarding flow
10. add event adapters + official web example

---

# Bottom line

The highest-leverage path is:

- **doctor first**,
- **operational skills second**,
- **runtime failover third**,
- **embedder APIs fourth**,
- **web/reference surfaces fifth**.

That sequencing improves Pi where OpenClaw most clearly proved the need: **real coding work under real autonomous runtime conditions**.
