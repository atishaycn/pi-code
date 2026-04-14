export type RoadmapPriority = "P0" | "P1" | "P2";
export type RoadmapRepoStatus = "missing" | "diverged" | "pi-only";

export interface RoadmapSubtask {
  id: string;
  label: string;
  isCurrentFocus?: boolean;
}

export interface RoadmapSubagentArchitecture {
  coordinator: string;
  workers: string[];
  validation: string[];
}

export interface RoadmapFeature {
  id: string;
  title: string;
  category: string;
  priority: RoadmapPriority;
  repoStatus: RoadmapRepoStatus;
  summary: string;
  evidence: string[];
  implementationPlan: string[];
  testPlan: string[];
  subagentArchitecture: RoadmapSubagentArchitecture;
  subtasks: RoadmapSubtask[];
  isCurrentFocus?: boolean;
}

export const ROADMAP_DOCUMENT_PATH = "docs/t3code-parity-delivery-plan.md";
export const ROADMAP_FEATURE_MAP_PATH = "docs/t3code-feature-map.md";
export const ROADMAP_RUNBOOK_PATH = "docs/t3code-parity-scheduled-runbook.md";

export const roadmapExecutionLoop = [
  "Sync upstreams and capture a fresh parity snapshot before making changes.",
  "Refresh the feature map and delivery-plan docs so priorities, risks, and ownership stay current.",
  "Work through the roadmap in priority order using the scout → planner → worker → reviewer → verifier pattern.",
  "Run bun fmt, bun lint, bun typecheck, and bun run test before marking any scheduled run complete.",
  "Publish artifacts, unresolved conflicts, and next-run starting points back into docs and roadmap state.",
] as const;

export const roadmapFeatures: readonly RoadmapFeature[] = [
  {
    id: "auth-bootstrap-pairing",
    title: "Auth bootstrap, secret storage, and pairing control plane",
    category: "Server + Contracts",
    priority: "P0",
    repoStatus: "missing",
    summary:
      "Port the upstream auth bootstrap path so Pi can safely pair browsers and desktops, persist bootstrap secrets, and gate access before provider sessions are created.",
    evidence: [
      "apps/server/src/auth/** exists only in upstream t3code.",
      "apps/server/src/startupAccess.ts and cliAuthFormat.ts exist only in upstream t3code.",
      "Auth migrations referenced in the feature map are absent in t3code-pi.",
    ],
    implementationPlan: [
      "Port the auth and secret-store contracts first, keeping packages/contracts schema-only and leaving runtime behavior inside apps/server.",
      "Add the server auth services, migrations, bootstrap secret generation, pairing-session persistence, and startup access checks behind a clean service boundary.",
      "Wire the bootstrap flow into server startup without regressing the existing Codex-first session lifecycle or the current WebSocket orchestration startup path.",
      "Expose the minimal RPC and HTTP surface needed by desktop and web clients to create, redeem, and rotate pairing credentials.",
    ],
    testPlan: [
      "Server integration tests for bootstrap-secret creation, pairing-session redemption, rotation, and rejection paths.",
      "Persistence tests for migrations, restart recovery, and invalid/expired token cleanup.",
      "End-to-end smoke test that unauthenticated clients cannot open provider-backed sessions until pairing succeeds.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: owns dependency order, shared contract sequencing, and the cutover plan across contracts, server, desktop, and web.",
      workers: [
        "scout: diff upstream auth files against Pi runtime touchpoints and produce a porting inventory before edits begin.",
        "worker x2: implement contracts plus server auth services in parallel after interfaces are locked.",
        "worker: integrate bootstrap/pairing transport endpoints and startup wiring after the server services pass tests.",
      ],
      validation: [
        "reviewer: audit security boundaries, expiry handling, and restart behavior.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and targeted bun run test suites for auth and startup flows.",
      ],
    },
    subtasks: [
      {
        id: "auth-bootstrap-persist-contracts",
        label: "Port auth/bootstrap contracts and persistence schemas",
      },
      {
        id: "auth-bootstrap-server-services",
        label: "Implement server auth services, migrations, and secret store",
      },
      {
        id: "auth-bootstrap-transport",
        label: "Expose pairing/bootstrap transport endpoints and startup gating",
      },
      {
        id: "auth-bootstrap-validation",
        label: "Add integration coverage for bootstrap, redemption, expiry, and restart recovery",
      },
    ],
  },
  {
    id: "auth-environment-contracts",
    title: "Shared auth and environment contracts",
    category: "Contracts",
    priority: "P0",
    repoStatus: "missing",
    summary:
      "Bring over the missing schema-only contracts so auth, environment, and connection flows can be shared safely across server, web, and desktop packages.",
    evidence: [
      "packages/contracts/src/auth.ts exists only in upstream t3code.",
      "packages/contracts/src/environment.ts exists only in upstream t3code.",
      "Feature map calls out missing auth/environment exports in packages/contracts.",
    ],
    implementationPlan: [
      "Port upstream auth and environment schema files with Pi naming and export conventions preserved.",
      "Add contract tests that prove decode/encode stability and default handling for all new message shapes.",
      "Update consuming package imports incrementally so downstream implementation work can land behind typed boundaries instead of ad-hoc objects.",
    ],
    testPlan: [
      "Contract decoding tests for happy-path and malformed payloads.",
      "Cross-package typecheck to ensure server and web builds consume the same contract surface.",
      "Regression coverage for any schema defaults or discriminated unions introduced during the port.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: define the contract matrix and the order downstream packages should adopt it.",
      workers: [
        "scout: map upstream auth/environment contracts to current Pi gaps and identify naming collisions.",
        "worker: port the schema files and update exports in packages/contracts.",
        "worker: add and expand packages/contracts tests for the new schemas.",
      ],
      validation: [
        "reviewer: confirm schema-only package purity and no runtime leakage.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and bun run test --filter packages/contracts where applicable.",
      ],
    },
    subtasks: [
      {
        id: "contracts-auth-port",
        label: "Port auth contract schemas and exports",
      },
      { id: "contracts-env-port", label: "Port environment contract schemas and exports" },
      { id: "contracts-tests", label: "Add contract decode/encode regression tests" },
    ],
  },
  {
    id: "multi-environment-runtime-model",
    title: "Multi-environment runtime model and routing",
    category: "Web + Server",
    priority: "P0",
    repoStatus: "missing",
    summary:
      "Upgrade Pi from single-environment thread routing to an environment-aware model that can target local and remote runtimes predictably.",
    evidence: [
      "apps/web/src/environments/**, environmentApi.ts, and localApi.ts exist only in upstream t3code.",
      "Upstream routes include environment-aware surfaces; Pi still routes through _chat.$threadId.tsx.",
      "Feature map flags current Pi routing as single-environment only.",
    ],
    implementationPlan: [
      "Port the environment catalog, connection service, and environment-aware route model behind the newly added contracts.",
      "Refactor router entry points, native API adapters, and thread selectors so environmentId becomes a first-class key everywhere a thread is resolved.",
      "Preserve predictable reconnect, replay, and session bootstrap behavior under environment switches and partial reconnects.",
      "Stage the rollout so local mode remains the default while remote environments are added additively.",
    ],
    testPlan: [
      "Route and state tests covering environment-scoped navigation, thread selection, and reconnect recovery.",
      "Server/web integration tests for environment catalog fetch, environment-bound session startup, and resume behavior.",
      "Manual regression on thread creation, diff loading, and terminal attach flows after route model changes.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: split the work into contracts, router/state, API transport, and recovery phases so the migration lands without breaking current chat flows.",
      workers: [
        "scout: inventory every threadId-only assumption across web and server.",
        "worker x2: implement environment-aware contracts plus transport adapters in parallel.",
        "worker: migrate routes, selectors, and state stores to environment-scoped keys after contracts land.",
      ],
      validation: [
        "reviewer: verify recovery, replay, and session ownership semantics after the route expansion.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and targeted bun run test suites for routing, session logic, and RPC.",
      ],
    },
    subtasks: [
      { id: "env-model-contracts", label: "Adopt environment contracts and catalog APIs" },
      {
        id: "env-model-routing",
        label: "Refactor routes and selectors to environment-scoped thread resolution",
      },
      {
        id: "env-model-transport",
        label: "Wire environment-aware native API and reconnect/recovery behavior",
      },
      { id: "env-model-validation", label: "Add route, state, and resume/recovery coverage" },
    ],
  },
  {
    id: "pairing-connections-ui",
    title: "Pairing route, QR flow, and connections settings UX",
    category: "Web UX",
    priority: "P0",
    repoStatus: "missing",
    summary:
      "Add the browser-facing pairing and connection management surfaces so users can connect Pi to authenticated runtimes without dropping into manual setup.",
    evidence: [
      "apps/web/src/components/auth/PairingRouteSurface.tsx exists only upstream.",
      "components/settings/ConnectionsSettings.tsx and components/ui/qr-code.tsx exist only upstream.",
      "Feature map identifies pairing route and connections settings as missing in Pi.",
    ],
    implementationPlan: [
      "Port the pairing route shell, QR presentation helper, and connection settings information architecture.",
      "Bind the screens to the auth/bootstrap transport added on the server so connection states are server-authoritative and resumable.",
      "Expose actionable status, retry affordances, and clear error copy for expired pairing codes and offline runtimes.",
    ],
    testPlan: [
      "Component tests for QR rendering, connection status transitions, and expired/invalid pairing states.",
      "Route tests for pairing entry, redemption success, and redirect behavior after connection creation.",
      "Manual smoke tests across desktop and browser for copy-link, QR scan, and connection removal flows.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: define the UX state machine and the contract surface to the auth backend.",
      workers: [
        "scout: compare upstream pairing UX with current Pi settings navigation and identify reusable components.",
        "worker: port QR/pairing UI primitives and route surfaces.",
        "worker: integrate connection settings state, server calls, and optimistic/error handling.",
      ],
      validation: [
        "reviewer: exercise failure states, offline copy, and accessibility of the pairing flow.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and targeted bun run test suites for routes and connection UI.",
      ],
    },
    subtasks: [
      { id: "pairing-ui-route", label: "Add pairing route shell and navigation entry points" },
      { id: "pairing-ui-qr", label: "Port QR rendering and copy/share affordances" },
      { id: "pairing-ui-settings", label: "Add connections settings panels and server wiring" },
      { id: "pairing-ui-validation", label: "Cover expired, invalid, offline, and success states" },
    ],
  },
  {
    id: "command-palette",
    title: "Extensible command palette",
    category: "Web UX",
    priority: "P1",
    repoStatus: "diverged",
    summary:
      "Bring over the upstream command palette so keyboard-driven actions, navigation, and future feature entry points can be accessed from one extensible surface.",
    evidence: [
      "apps/web/src/commandPaletteStore.ts and CommandPalette*.tsx exist only in upstream t3code.",
      "Feature map calls command palette out as one of the clearest upstream gaps.",
    ],
    implementationPlan: [
      "Port the command-palette store, UI shell, and action registration pattern as an additive web-only feature.",
      "Register current Pi actions first: new thread, settings, roadmap, archived threads, branch/worktree actions, and active-thread navigation.",
      "Expose an extension point so future Pi-only provider or automation commands plug into the same registry instead of creating separate menus.",
    ],
    testPlan: [
      "Logic tests for command registration, ranking, visibility predicates, and keyboard shortcuts.",
      "Component tests for open/close, search filtering, and command invocation.",
      "Manual regression with current global shortcuts and modal focus traps.",
    ],
    subagentArchitecture: {
      coordinator: "planner: lock the command registry API before UI and feature bindings diverge.",
      workers: [
        "scout: identify existing Pi shortcut and action surfaces that should register commands.",
        "worker: port the store and base palette components.",
        "worker: bind Pi actions and global shortcuts into the new palette registry.",
      ],
      validation: [
        "reviewer: confirm keyboard ergonomics, focus behavior, and action deduplication.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and targeted bun run test suites for palette logic and UI.",
      ],
    },
    subtasks: [
      { id: "palette-store", label: "Port the command palette store and base registry" },
      { id: "palette-ui", label: "Add palette UI, keyboard entry points, and search" },
      {
        id: "palette-bindings",
        label: "Register core Pi actions and navigation commands",
      },
      { id: "palette-validation", label: "Add logic and invocation coverage" },
    ],
  },
  {
    id: "provider-skill-discovery",
    title: "Provider skill discovery and presentation helpers",
    category: "Web UX",
    priority: "P2",
    repoStatus: "diverged",
    summary:
      "Expose provider skill search and presentation helpers so model/provider capabilities can be surfaced consistently throughout the UI.",
    evidence: [
      "apps/web/src/providerSkillPresentation.ts and providerSkillSearch.ts exist only upstream.",
      "Feature map lists provider skill discovery/presentation as missing in Pi.",
    ],
    implementationPlan: [
      "Port the skill search helpers and presentation utilities as shared web-side helpers.",
      "Integrate skill chips or searchable affordances into provider/model selection surfaces without bloating the composer.",
      "Keep the helpers provider-neutral so Pi-only adapters can expose capabilities through the same contract.",
    ],
    testPlan: [
      "Unit tests for search ranking, tokenization, and display label generation.",
      "Component tests for rendering provider skills in selection surfaces.",
      "Manual regression on compact and expanded composer layouts.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: decide the canonical skill presentation model and where it appears in the UI.",
      workers: [
        "scout: locate provider metadata sources already available in Pi.",
        "worker: port provider skill search/presentation helpers.",
        "worker: integrate helpers into provider/model selection surfaces.",
      ],
      validation: [
        "reviewer: verify provider-neutral design and avoid duplicated formatting logic.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and targeted bun run test suites for helper logic and UI rendering.",
      ],
    },
    subtasks: [
      { id: "skills-helper-port", label: "Port skill search and presentation helpers" },
      { id: "skills-ui-binding", label: "Integrate provider skills into selection surfaces" },
      { id: "skills-validation", label: "Cover search behavior and rendering states" },
    ],
  },
  {
    id: "desktop-runtime-hardening",
    title: "Desktop backend readiness, port scanning, and persistence hardening",
    category: "Desktop",
    priority: "P1",
    repoStatus: "diverged",
    summary:
      "Port the upstream desktop helpers that make backend boot more predictable, persistent, and diagnosable under slow startup or port conflicts.",
    evidence: [
      "apps/desktop/src/backendPort.ts, backendReadiness.ts, desktopSettings.ts, clientPersistence.ts, and serverExposure.ts exist only upstream.",
      "Feature map highlights desktop bootstrapping/persistence hardening as missing in Pi.",
    ],
    implementationPlan: [
      "Port the sequential port scan and readiness helpers so desktop waits for the backend deterministically.",
      "Restore desktop settings and persistence helpers needed for connection reuse and stable local startup behavior.",
      "Audit Pi-specific desktop integration changes so the hardening lands without regressing the current preload and update-state wiring.",
    ],
    testPlan: [
      "Desktop unit tests for port selection, readiness timeout behavior, and persisted settings parsing.",
      "Smoke validation of cold start, backend restart, and stale-port recovery on desktop.",
      "Manual regression around preload exposure and update-state handling.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: isolate pure helpers from Electron-specific glue so the port stays maintainable.",
      workers: [
        "scout: diff upstream desktop helper modules against Pi's current desktop shell changes.",
        "worker: port backend readiness, port selection, and persistence helpers.",
        "worker: integrate the helpers into Electron boot and recovery paths.",
      ],
      validation: [
        "reviewer: verify predictable startup under conflicts, retries, and stale process scenarios.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and targeted bun run test or smoke suites for desktop helpers.",
      ],
    },
    subtasks: [
      { id: "desktop-hardening-port", label: "Port backend readiness and port scan helpers" },
      {
        id: "desktop-hardening-persistence",
        label: "Restore desktop settings and client persistence helpers",
      },
      {
        id: "desktop-hardening-integration",
        label: "Integrate helpers into Electron startup and recovery",
      },
      {
        id: "desktop-hardening-validation",
        label: "Validate cold start, restart, and stale-port recovery",
      },
    ],
  },
  {
    id: "window-controls-overlay",
    title: "Window controls overlay support",
    category: "Web UX",
    priority: "P2",
    repoStatus: "diverged",
    summary:
      "Support window-controls overlay layouts so desktop title bars and drag regions behave correctly across platforms with modern overlays enabled.",
    evidence: [
      "apps/web/src/lib/windowControlsOverlay.ts exists only upstream.",
      "Feature map marks overlay support as missing in Pi.",
    ],
    implementationPlan: [
      "Port the overlay detection helper and connect it to Electron-specific layout regions.",
      "Adjust top-level route headers and drag regions to respect overlay insets without breaking browser layouts.",
      "Keep the feature additive and guarded so non-desktop surfaces keep current behavior.",
    ],
    testPlan: [
      "Helper tests for overlay detection and fallback behavior.",
      "Component layout tests for desktop headers with and without overlay support.",
      "Manual cross-platform verification on macOS, Windows, and Linux desktop builds.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: define the shared layout contract between Electron shell code and web headers.",
      workers: [
        "scout: identify all drag-region and title-bar assumptions in current Pi routes.",
        "worker: port overlay helper logic.",
        "worker: update route headers and desktop-only layout regions.",
      ],
      validation: [
        "reviewer: verify no regressions in browser mode and no dead drag regions on desktop.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and targeted bun run test coverage for helper and header logic.",
      ],
    },
    subtasks: [
      { id: "overlay-helper-port", label: "Port window-controls overlay helper" },
      {
        id: "overlay-layout-integration",
        label: "Integrate overlay insets into desktop headers and drag regions",
      },
      {
        id: "overlay-validation",
        label: "Validate browser fallback and cross-platform desktop layouts",
      },
    ],
  },
  {
    id: "server-runtime-http-surface",
    title: "Server runtime state and orchestration HTTP surface",
    isCurrentFocus: true,
    category: "Server",
    priority: "P1",
    repoStatus: "diverged",
    summary:
      "Port the additive server runtime state and orchestration HTTP helpers that upstream uses for runtime inspection, bootstrap glue, and non-WebSocket integration.",
    evidence: [
      "apps/server/src/orchestration/http.ts, runtimeLayer.ts, serverRuntimeState.ts, and http.test.ts exist only upstream.",
      "Feature map flags this server runtime/orchestration HTTP surface as missing in Pi.",
    ],
    implementationPlan: [
      "Port runtime state helpers and the orchestration HTTP endpoints in an additive layer alongside the existing WebSocket server.",
      "Reuse existing orchestration engine and projection services instead of duplicating read-model assembly logic.",
      "Ensure HTTP state reads remain consistent with the authoritative in-memory orchestration pipeline already used by Pi.",
    ],
    testPlan: [
      "Server tests for runtime state reads, orchestration snapshot responses, and error handling.",
      "Integration coverage that HTTP reads match WebSocket-backed projection state after live events.",
      "Manual smoke checks for startup and health inspection workflows.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: define the minimal additive HTTP surface and align it with existing server services.",
      workers: [
        "scout: map upstream runtime HTTP handlers to Pi's current ws.ts and server startup wiring.",
        "worker: port runtime state and HTTP handler modules.",
        "worker: integrate the handlers into the server composition root and startup path.",
      ],
      validation: [
        "reviewer: confirm no duplicate source of truth is introduced beside the orchestration engine.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and targeted bun run test suites for server runtime HTTP behavior.",
      ],
    },
    subtasks: [
      {
        id: "runtime-http-port",
        label: "Port runtime state and orchestration HTTP modules",
        isCurrentFocus: true,
      },
      { id: "runtime-http-integration", label: "Integrate the HTTP layer into server startup" },
      {
        id: "runtime-http-validation",
        label: "Validate parity with WebSocket-backed projection state",
      },
    ],
  },
  {
    id: "github-pr-repository-helpers",
    title: "GitHub pull request and repository identity helpers",
    category: "Server + Git",
    priority: "P1",
    repoStatus: "diverged",
    summary:
      "Restore the upstream repository identity and PR lookup helpers so git-aware UX can resolve richer repo metadata reliably.",
    evidence: [
      "apps/server/src/git/githubPullRequests.ts exists only upstream.",
      "apps/server/src/project/RepositoryIdentityResolver.ts exists only upstream.",
      "Feature map lists GitHub PR and repository identity helpers as missing in Pi.",
    ],
    implementationPlan: [
      "Port the pure repository identity and GitHub PR helpers first, keeping them isolated from chat runtime code.",
      "Integrate them behind explicit server service boundaries so PR-aware UI can query them without coupling to git internals.",
      "Use the helpers to improve branch/worktree and PR surfaces incrementally after the backend contracts are stable.",
    ],
    testPlan: [
      "Unit tests for repo identity parsing and remote resolution.",
      "Integration tests for PR lookup flows with mocked GitHub responses or fixtures.",
      "Manual validation from branch/PR UI paths once hooked into the web app.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: keep helper boundaries explicit so git, GitHub, and UI concerns do not bleed together.",
      workers: [
        "scout: inventory current git/PR touchpoints in Pi that should consume the new helpers.",
        "worker: port repository identity helper and tests.",
        "worker: port GitHub PR helper and integrate server-side query entry points.",
      ],
      validation: [
        "reviewer: verify pure helper extraction and error handling around missing remotes or API failures.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and targeted bun run test suites for git and project helpers.",
      ],
    },
    subtasks: [
      { id: "github-helper-identity", label: "Port repository identity resolver" },
      { id: "github-helper-pr", label: "Port GitHub pull request helper and server bindings" },
      { id: "github-helper-validation", label: "Validate repo parsing and PR lookup behavior" },
    ],
  },
  {
    id: "shared-search-ranking",
    title: "Shared search ranking helper",
    category: "Shared Utilities",
    priority: "P1",
    repoStatus: "diverged",
    summary:
      "Port the upstream shared search ranking utility so command palette, provider-skill search, and connection selection all use the same predictable ranking behavior.",
    evidence: [
      "packages/shared/src/searchRanking.ts exists only upstream.",
      "Feature map calls search ranking out as a missing shared utility.",
    ],
    implementationPlan: [
      "Port the helper as a subpath export in packages/shared with no barrel-index regression.",
      "Adopt it first in new command palette and provider skill search surfaces, then replace any ad-hoc ranking code that appears later.",
      "Document the ranking heuristics so future UX search surfaces stay consistent.",
    ],
    testPlan: [
      "Shared-package unit tests for exact, prefix, token, and fuzzy ranking cases.",
      "Cross-consumer tests in web logic for command and skill search adoption.",
      "Typecheck for shared subpath exports.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: define one canonical ranking contract and the first consumers that must adopt it.",
      workers: [
        "scout: find any existing search/filter heuristics already duplicated in Pi.",
        "worker: port search ranking helper and tests into packages/shared.",
        "worker: adopt the helper in web-side search surfaces as they land.",
      ],
      validation: [
        "reviewer: verify explicit subpath exports and no shared barrel creep.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and targeted bun run test suites for shared ranking logic.",
      ],
    },
    subtasks: [
      {
        id: "search-ranking-helper-port",
        label: "Port shared search ranking helper and export it via subpath",
      },
      {
        id: "search-ranking-adoption",
        label: "Adopt shared ranking in command and skill search surfaces",
      },
      { id: "search-ranking-validation", label: "Validate ranking heuristics with focused tests" },
    ],
  },
  {
    id: "client-runtime-package",
    title: "packages/client-runtime parity layer",
    category: "Shared Runtime",
    priority: "P1",
    repoStatus: "diverged",
    summary:
      "Recover the missing client-runtime package or an equivalent extracted layer so upstream-ready runtime helpers stop leaking into web and desktop app code.",
    evidence: [
      "packages/client-runtime/** exists only in upstream t3code.",
      "Feature map calls out workspace layout parity missing because Pi has no packages/client-runtime.",
    ],
    implementationPlan: [
      "Audit what upstream runtime helpers are genuinely needed in Pi instead of blindly copying the whole package.",
      "Extract the subset that reduces duplication between desktop and web bootstrap/runtime code.",
      "Add explicit subpath exports and keep package boundaries narrow so it improves maintainability instead of just moving files.",
    ],
    testPlan: [
      "Package-level tests for any extracted pure helpers.",
      "Typecheck across desktop, web, and server to confirm the new package boundary resolves cleanly.",
      "Regression tests for any moved bootstrap or connection helper behavior.",
    ],
    subagentArchitecture: {
      coordinator:
        "planner: decide whether to recreate the upstream package 1:1 or extract a Pi-specific minimal runtime package.",
      workers: [
        "scout: map duplication across desktop/web that a client-runtime package would absorb.",
        "worker: extract and wire the first set of shared runtime helpers.",
        "worker: update downstream imports and package exports incrementally.",
      ],
      validation: [
        "reviewer: confirm the extraction reduces duplication and does not create a grab-bag package.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and targeted bun run test suites for the extracted helpers.",
      ],
    },
    subtasks: [
      {
        id: "client-runtime-audit",
        label: "Audit upstream package/client-runtime surface against Pi needs",
      },
      {
        id: "client-runtime-extract",
        label: "Extract the minimal shared runtime helpers into a dedicated package",
      },
      {
        id: "client-runtime-adopt",
        label: "Adopt the new package from desktop and web bootstrap paths",
      },
      {
        id: "client-runtime-validation",
        label: "Validate imports, exports, and moved-helper behavior",
      },
    ],
  },
  {
    id: "qr-code-shared-utility",
    title: "Shared QR code utility",
    category: "Shared Utilities",
    priority: "P2",
    repoStatus: "diverged",
    summary:
      "Add the QR code utility needed by the pairing UX so QR rendering is shared and testable instead of being embedded into one component.",
    evidence: [
      "Recommended merge order in the feature map includes packages/shared/src/qrCode.ts as a low-risk shared addition.",
      "Pairing UI in upstream depends on QR support that Pi currently lacks.",
    ],
    implementationPlan: [
      "Port or recreate the shared QR helper in packages/shared with an explicit subpath export.",
      "Consume it from the pairing route and any future connection-sharing flows.",
      "Keep the helper pure so rendering components stay thin and independently testable.",
    ],
    testPlan: [
      "Unit tests for deterministic QR payload generation or encoding helpers.",
      "Component tests that pairing UI renders a QR artifact from the shared helper.",
      "Typecheck for new shared exports and consumer imports.",
    ],
    subagentArchitecture: {
      coordinator: "planner: align the helper boundary with the pairing UX before UI work starts.",
      workers: [
        "scout: inspect upstream QR helper surface and downstream consumers.",
        "worker: port the shared QR utility and package export.",
        "worker: consume the helper from pairing UI once that route exists.",
      ],
      validation: [
        "reviewer: verify deterministic output and avoid embedding UI concerns in the shared helper.",
        "verifier pass: bun fmt, bun lint, bun typecheck, and targeted bun run test suites for shared helper plus consumer UI.",
      ],
    },
    subtasks: [
      {
        id: "qr-helper-port",
        label: "Port shared QR code helper and export it from packages/shared",
      },
      { id: "qr-helper-adopt", label: "Consume the helper from pairing and connection-sharing UI" },
      { id: "qr-helper-validation", label: "Validate deterministic output and consumer rendering" },
    ],
  },
] as const;
