import type { RoadmapFeature } from "../roadmap/roadmapData";

export const OPENCLAW_ROADMAP_DOCUMENT_PATH = "docs/pi-openclaw-roadmap.md";
export const OPENCLAW_BACKLOG_DOCUMENT_PATH = "docs/pi-openclaw-implementation-backlog.md";

export const openClawRoadmapExecutionLoop = [
  "Keep the scope constrained to Pi as a coding harness and autonomous coding-agent runtime.",
  "Land stable internal contracts first so diagnostics JSON and embedder-facing behavior stay predictable.",
  "Prefer mergeable vertical slices over broad refactors, with docs and verification in every slice.",
  "Reassess after the first shippable milestone: doctor MVP + core diagnostics coverage.",
] as const;

export const openClawRoadmapFeatures: readonly RoadmapFeature[] = [
  {
    id: "diagnostics-repair",
    title: "Diagnostics & Repair",
    category: "CLI + Core",
    priority: "P0",
    repoStatus: "pi-only",
    summary:
      "Build a first-class diagnostics subsystem and pi doctor flow so broken installs, bad config, corrupt sessions, and skill/extension issues become easy to detect and repair.",
    evidence: [
      "docs/pi-openclaw-roadmap.md: pi doctor is the highest-priority core feature.",
      "docs/pi-openclaw-implementation-backlog.md: Workstream 1 and Epic 1.1 define the doctor MVP, JSON output, and later --fix support.",
    ],
    implementationPlan: [
      "Define stable diagnostics types and a doctor report contract first.",
      "Ship read-only checks for settings, models, auth availability, tools, and sessions before adding repair actions.",
      "Add human CLI rendering only after JSON output is stable enough for embedders and wrappers.",
    ],
    testPlan: [
      "Unit coverage for each doctor check and report aggregation.",
      "CLI snapshot coverage for human and JSON output.",
      "Validation runs covering malformed settings/models and corrupted session fixtures.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: sequence types, checks, and CLI presentation so the contract stabilizes before user-facing polish.",
      workers: [
        "scout: inventory existing settings/models/session loading paths and likely failure modes.",
        "worker: implement diagnostics core and report types.",
        "worker: wire CLI command, JSON mode, and initial checks.",
      ],
      validation: [
        "reviewer: ensure fix hints are precise and no destructive behavior is introduced in read-only mode.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and bun run test for diagnostics/CLI coverage.",
      ],
    },
    subtasks: [
      {
        id: "openclaw-doctor-types",
        label: "Stabilize PiDiagnostic and DoctorReport contracts",
        isCurrentFocus: true,
      },
      { id: "openclaw-doctor-cli", label: "Add pi doctor skeleton with JSON output" },
      {
        id: "openclaw-doctor-checks",
        label: "Cover settings, models, sessions, tools, and auth diagnostics",
      },
      { id: "openclaw-doctor-fix", label: "Add guarded repair flows and backups for safe fixes" },
    ],
    isCurrentFocus: true,
  },
  {
    id: "setup-onboarding",
    title: "Setup & Onboarding",
    category: "CLI + TUI",
    priority: "P1",
    repoStatus: "pi-only",
    summary:
      "Create a coding-focused onboarding flow that detects providers, auth options, tools, and recommended defaults so new users reach a working coding-agent setup quickly.",
    evidence: [
      "docs/pi-openclaw-roadmap.md: pi onboard / pi setup is a Tier 1 proposal.",
      "docs/pi-openclaw-implementation-backlog.md: Workstream 2 defines onboarding presets and health verification.",
    ],
    implementationPlan: [
      "Start with a non-interactive config generator that reuses diagnostics checks.",
      "Add an interactive wizard only after the underlying setup state machine is stable.",
      "Finish with coding-focused presets and optional skill/extension starter packs.",
    ],
    testPlan: [
      "Wizard/state tests for selected provider/model/auth combinations.",
      "Fixture tests for generated baseline settings files.",
      "Smoke coverage that onboarding ends with verification rather than blind success.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: keep onboarding built on top of diagnostics and provider/model primitives instead of duplicating validation logic.",
      workers: [
        "scout: map current auth/setup docs and CLI affordances to onboarding gaps.",
        "worker: implement reusable onboarding core and config generation.",
        "worker: build TUI wizard and coding presets once the backend contract is stable.",
      ],
      validation: [
        "reviewer: check that onboarding improves first-run success without hiding important provider/runtime choices.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and bun run test for onboarding flows.",
      ],
    },
    subtasks: [
      {
        id: "openclaw-onboard-core",
        label: "Ship non-interactive onboarding core and config generator",
      },
      {
        id: "openclaw-onboard-health",
        label: "Reuse diagnostics to verify model, auth, and tools",
      },
      { id: "openclaw-onboard-wizard", label: "Add interactive TUI onboarding flow" },
    ],
  },
  {
    id: "runtime-resilience",
    title: "Runtime Resilience",
    category: "Runtime + Providers",
    priority: "P0",
    repoStatus: "pi-only",
    summary:
      "Improve autonomous run reliability with auth profiles, retry classification, cooldowns, and transparent failover behavior across providers and fallback models.",
    evidence: [
      "docs/pi-openclaw-roadmap.md: auth profile rotation + model failover is a top core opportunity.",
      "docs/pi-openclaw-implementation-backlog.md: Workstream 3 centers on auth profiles and retry/cooldown behavior.",
    ],
    implementationPlan: [
      "Introduce auth profile abstractions without making single-profile users pay complexity by default.",
      "Classify retryable vs fatal provider failures and emit structured failover summaries.",
      "Land fallback/cooldown behavior before broad UX work so unattended runs become safer early.",
    ],
    testPlan: [
      "Provider/runtime tests for transient auth errors, cooldown windows, and fallback ordering.",
      "Session recovery coverage to ensure retries and failover are visible in runtime state.",
      "Regression tests for simple single-profile configurations.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: sequence auth storage changes, provider routing, and runtime failover semantics to preserve predictable behavior under failure.",
      workers: [
        "scout: trace provider request paths, current auth storage, and model fallback assumptions.",
        "worker x2: implement auth profile types/storage and retry classification in parallel once interfaces are locked.",
        "worker: integrate runtime failover summaries, session visibility, and docs.",
      ],
      validation: [
        "reviewer: verify transparent failover, cooldown safety, and no surprise behavior for single-profile users.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and bun run test for provider/runtime coverage.",
      ],
    },
    subtasks: [
      { id: "openclaw-auth-profiles", label: "Add auth profile abstractions and profile state" },
      { id: "openclaw-retry-classification", label: "Classify retryable vs fatal failures" },
      {
        id: "openclaw-failover-runtime",
        label: "Implement profile rotation, cooldowns, and fallback models",
      },
    ],
  },
  {
    id: "session-embedder-apis",
    title: "Session / Embedder APIs",
    category: "SDK + Runtime",
    priority: "P0",
    repoStatus: "pi-only",
    summary:
      "Expose cleaner session metadata, patch APIs, live state, and runtime control surfaces so products embedding Pi can manage autonomous coding sessions predictably.",
    evidence: [
      "docs/pi-openclaw-roadmap.md: better session/runtime control APIs are highlighted as core embedder work.",
      "docs/pi-openclaw-implementation-backlog.md: Workstream 4 prioritizes session metadata and patch APIs after runtime hardening.",
    ],
    implementationPlan: [
      "Stabilize session metadata read APIs before mutation APIs.",
      "Add patch semantics for model/thinking/session overrides with explicit validation.",
      "Document the contract before shipping reference examples so embedders target the right surface.",
    ],
    testPlan: [
      "Schema and API tests for list/get/patch/delete/abort surfaces.",
      "State-transition coverage for active runs, retry visibility, and restart/reconnect behavior.",
      "SDK-facing examples validated against the final runtime contract.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: separate read-only metadata APIs from mutating controls so embedders can adopt incrementally.",
      workers: [
        "scout: inventory current session-manager and embedder touchpoints.",
        "worker: implement metadata enumeration and stable session shapes.",
        "worker: add patch/abort runtime control APIs and validation.",
      ],
      validation: [
        "reviewer: verify persistence boundaries, restart semantics, and embedder ergonomics.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and bun run test for runtime API coverage.",
      ],
    },
    subtasks: [
      { id: "openclaw-session-metadata", label: "Add stable session metadata/list/get APIs" },
      { id: "openclaw-session-patch", label: "Add validated patch APIs for per-session overrides" },
      {
        id: "openclaw-session-runtime",
        label: "Expose active run and abort/retry control surfaces",
      },
    ],
  },
  {
    id: "operational-skills",
    title: "Operational Skills",
    category: "Skills + Extensions",
    priority: "P1",
    repoStatus: "pi-only",
    summary:
      "Make skills and extensions safer under autonomous operation with gating metadata, health reporting, and eventually doctor hooks for custom stacks.",
    evidence: [
      "docs/pi-openclaw-implementation-backlog.md: Workstream 5 prioritizes skill gating metadata and health reporting early.",
      "docs/pi-openclaw-roadmap.md: skills/extensions should become more operational and diagnosable, not just installable.",
    ],
    implementationPlan: [
      "Add declarative gating metadata so the runtime knows when a skill is safe and available.",
      "Expose health status and diagnostics for failed discovery, invalid frontmatter, and unmet prerequisites.",
      "Open the door to extension-contributed doctor hooks once core diagnostics exist.",
    ],
    testPlan: [
      "Skill discovery and frontmatter validation tests.",
      "Runtime gating tests that prevent invalid skill activation.",
      "Doctor/health output tests for missing dependencies and broken skills/extensions.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: define shared metadata once and consume it across discovery, runtime gating, and diagnostics.",
      workers: [
        "scout: audit current skill/extension loading and identify duplicate validity checks.",
        "worker: implement shared skill gating metadata and loaders.",
        "worker: add health reporting and diagnostics integration.",
      ],
      validation: [
        "reviewer: ensure operational metadata stays declarative and doesn't leak runtime-only policy into schema packages.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and bun run test for skill/extension coverage.",
      ],
    },
    subtasks: [
      { id: "openclaw-skill-gating", label: "Add skill gating metadata and validation" },
      { id: "openclaw-skill-health", label: "Expose skill health reporting and diagnostics" },
      { id: "openclaw-doctor-hooks", label: "Add extension-contributed doctor hooks" },
    ],
  },
  {
    id: "reference-surfaces",
    title: "Reference Surfaces",
    category: "Docs + Examples",
    priority: "P2",
    repoStatus: "pi-only",
    summary:
      "Round out the work with event adapters, official web examples, and clear docs that demonstrate the hardened runtime and embedder APIs in real coding-oriented flows.",
    evidence: [
      "docs/pi-openclaw-implementation-backlog.md: Workstream 6 places event adapters and official examples near the end.",
      "The roadmap explicitly deprioritizes non-coding product surfaces, so examples should reinforce coding-agent embedding and operations.",
    ],
    implementationPlan: [
      "Wait until diagnostics and session/embedder contracts are stable.",
      "Ship official examples that exercise the intended APIs instead of experimental internals.",
      "Use docs/examples as reference surfaces, not as places to invent new runtime behavior.",
    ],
    testPlan: [
      "Example smoke tests or validation scripts where feasible.",
      "Docs review to ensure commands and API shapes match shipped behavior.",
      "Manual embedder validation of event adapters and example app flows.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: keep examples downstream of finalized APIs so they document reality instead of speculation.",
      workers: [
        "scout: identify the thinnest reference app and event-adapter surfaces that prove the core APIs.",
        "worker: build official examples against stable session/runtime APIs.",
        "worker: land docs and example verification steps.",
      ],
      validation: [
        "reviewer: ensure examples reinforce coding-agent use cases rather than generic assistant sprawl.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and bun run test for any example-covered code paths.",
      ],
    },
    subtasks: [
      { id: "openclaw-event-adapters", label: "Add event adapters for embedders" },
      { id: "openclaw-web-example", label: "Ship an official web embedder example" },
      { id: "openclaw-docs", label: "Publish docs after the public contracts stabilize" },
    ],
  },
] as const;
