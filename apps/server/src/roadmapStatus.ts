import * as FS from "node:fs/promises";
import * as Path from "node:path";

import type { ServerGetRoadmapStatusResult } from "@t3tools/contracts";

interface PathRule {
  readonly subtaskId: string;
  readonly requiredPaths: readonly string[];
}

interface InfrastructureRule {
  readonly id: string;
  readonly label: string;
  readonly requiredPaths?: readonly string[];
  readonly contains?: {
    readonly path: string;
    readonly needle: string;
  };
}

interface ValidationArtifactCheck {
  readonly id: "fmt" | "lint" | "typecheck" | "test";
  readonly label: string;
  readonly status: "unknown" | "pass" | "fail";
  readonly detail?: string;
  readonly updatedAt?: string;
}

interface ValidationArtifact {
  readonly generatedAt?: string;
  readonly checks?: readonly ValidationArtifactCheck[];
}

const ROADMAP_SUBTASK_RULES: readonly PathRule[] = [
  {
    subtaskId: "auth-bootstrap-persist-contracts",
    requiredPaths: [
      "packages/contracts/src/auth.ts",
      "apps/server/src/persistence/Migrations/020_AuthAccessManagement.ts",
    ],
  },
  {
    subtaskId: "auth-bootstrap-server-services",
    requiredPaths: [
      "apps/server/src/auth/Services/ServerAuth.ts",
      "apps/server/src/persistence/Services/AuthSessions.ts",
    ],
  },
  {
    subtaskId: "auth-bootstrap-transport",
    requiredPaths: [
      "apps/server/src/startupAccess.ts",
      "apps/server/src/cliAuthFormat.ts",
      "apps/server/src/auth/http.ts",
    ],
  },
  {
    subtaskId: "auth-bootstrap-validation",
    requiredPaths: [
      "apps/server/src/startupAccess.test.ts",
      "apps/server/src/auth/Layers/ServerAuth.test.ts",
    ],
  },
  {
    subtaskId: "contracts-auth-port",
    requiredPaths: ["packages/contracts/src/auth.ts"],
  },
  {
    subtaskId: "contracts-env-port",
    requiredPaths: ["packages/contracts/src/environment.ts"],
  },
  {
    subtaskId: "contracts-tests",
    requiredPaths: [
      "packages/contracts/src/auth.test.ts",
      "packages/contracts/src/environment.test.ts",
    ],
  },
  {
    subtaskId: "env-model-contracts",
    requiredPaths: ["packages/contracts/src/environment.ts"],
  },
  {
    subtaskId: "env-model-routing",
    requiredPaths: ["apps/web/src/routes/_chat.$environmentId.$threadId.tsx"],
  },
  {
    subtaskId: "env-model-transport",
    requiredPaths: [
      "apps/web/src/environmentApi.ts",
      "apps/web/src/localApi.ts",
      "apps/web/src/environments/runtime/service.ts",
    ],
  },
  {
    subtaskId: "env-model-validation",
    requiredPaths: [
      "apps/web/src/environments/runtime/service.test.ts",
      "apps/web/src/threadRoutes.test.ts",
    ],
  },
  {
    subtaskId: "pairing-ui-route",
    requiredPaths: [
      "apps/web/src/routes/pair.tsx",
      "apps/web/src/components/auth/PairingRouteSurface.tsx",
    ],
  },
  {
    subtaskId: "pairing-ui-qr",
    requiredPaths: ["apps/web/src/components/ui/qr-code.tsx"],
  },
  {
    subtaskId: "pairing-ui-settings",
    requiredPaths: [
      "apps/web/src/components/settings/ConnectionsSettings.tsx",
      "apps/web/src/routes/settings.connections.tsx",
    ],
  },
  {
    subtaskId: "pairing-ui-validation",
    requiredPaths: [
      "apps/web/src/components/ui/qr-code.test.tsx",
      "apps/web/test/authHttpHandlers.ts",
    ],
  },
  {
    subtaskId: "palette-store",
    requiredPaths: [
      "apps/web/src/commandPaletteStore.ts",
      "apps/web/src/components/CommandPalette.logic.ts",
    ],
  },
  {
    subtaskId: "palette-ui",
    requiredPaths: [
      "apps/web/src/components/CommandPalette.tsx",
      "apps/web/src/components/CommandPaletteResults.tsx",
    ],
  },
  {
    subtaskId: "palette-bindings",
    requiredPaths: ["apps/web/src/routes/__root.tsx", "apps/web/src/routes/_chat.tsx"],
  },
  {
    subtaskId: "palette-validation",
    requiredPaths: ["apps/web/src/components/CommandPalette.logic.test.ts"],
  },
  {
    subtaskId: "skills-helper-port",
    requiredPaths: [
      "apps/web/src/providerSkillPresentation.ts",
      "apps/web/src/providerSkillSearch.ts",
    ],
  },
  {
    subtaskId: "skills-validation",
    requiredPaths: [
      "apps/web/src/providerSkillPresentation.test.ts",
      "apps/web/src/providerSkillSearch.test.ts",
    ],
  },
  {
    subtaskId: "desktop-hardening-port",
    requiredPaths: ["apps/desktop/src/backendPort.ts", "apps/desktop/src/backendReadiness.ts"],
  },
  {
    subtaskId: "desktop-hardening-persistence",
    requiredPaths: ["apps/desktop/src/desktopSettings.ts", "apps/desktop/src/clientPersistence.ts"],
  },
  {
    subtaskId: "desktop-hardening-integration",
    requiredPaths: ["apps/desktop/src/serverExposure.ts"],
  },
  {
    subtaskId: "desktop-hardening-validation",
    requiredPaths: [
      "apps/desktop/src/backendPort.test.ts",
      "apps/desktop/src/backendReadiness.test.ts",
      "apps/desktop/src/desktopSettings.test.ts",
    ],
  },
  {
    subtaskId: "overlay-helper-port",
    requiredPaths: ["apps/web/src/lib/windowControlsOverlay.ts"],
  },
  {
    subtaskId: "overlay-validation",
    requiredPaths: ["apps/web/src/lib/windowControlsOverlay.test.ts"],
  },
  {
    subtaskId: "runtime-http-port",
    requiredPaths: [
      "apps/server/src/orchestration/http.ts",
      "apps/server/src/orchestration/runtimeLayer.ts",
      "apps/server/src/serverRuntimeState.ts",
    ],
  },
  {
    subtaskId: "runtime-http-integration",
    requiredPaths: ["apps/server/src/server.ts"],
  },
  {
    subtaskId: "runtime-http-validation",
    requiredPaths: ["apps/server/src/http.test.ts"],
  },
  {
    subtaskId: "github-helper-identity",
    requiredPaths: ["apps/server/src/project/Services/RepositoryIdentityResolver.ts"],
  },
  {
    subtaskId: "github-helper-pr",
    requiredPaths: ["apps/server/src/git/githubPullRequests.ts"],
  },
  {
    subtaskId: "github-helper-validation",
    requiredPaths: ["apps/server/src/project/Layers/RepositoryIdentityResolver.test.ts"],
  },
  {
    subtaskId: "search-ranking-helper-port",
    requiredPaths: ["packages/shared/src/searchRanking.ts"],
  },
  {
    subtaskId: "search-ranking-validation",
    requiredPaths: ["packages/shared/src/searchRanking.test.ts"],
  },
  {
    subtaskId: "client-runtime-extract",
    requiredPaths: ["packages/client-runtime/package.json", "packages/client-runtime/src/index.ts"],
  },
  {
    subtaskId: "client-runtime-validation",
    requiredPaths: ["packages/client-runtime/src/knownEnvironment.test.ts"],
  },
  {
    subtaskId: "qr-helper-port",
    requiredPaths: ["packages/shared/src/qrCode.ts"],
  },
  {
    subtaskId: "qr-helper-validation",
    requiredPaths: ["apps/web/src/components/ui/qr-code.test.tsx"],
  },
] as const;

const INFRASTRUCTURE_RULES: readonly InfrastructureRule[] = [
  {
    id: "feature-map",
    label: "Feature map document",
    requiredPaths: ["docs/t3code-feature-map.md"],
  },
  {
    id: "delivery-plan",
    label: "Detailed delivery plan",
    requiredPaths: ["docs/t3code-parity-delivery-plan.md"],
  },
  {
    id: "scheduled-runbook",
    label: "Scheduled parity runbook",
    requiredPaths: ["docs/t3code-parity-scheduled-runbook.md"],
  },
  {
    id: "roadmap-route",
    label: "Roadmap route",
    requiredPaths: ["apps/web/src/routes/roadmap.tsx"],
  },
  {
    id: "roadmap-dashboard",
    label: "Roadmap dashboard UI",
    requiredPaths: ["apps/web/src/components/RoadmapDashboard.tsx"],
  },
  {
    id: "roadmap-live-feed",
    label: "Roadmap live event feed",
    requiredPaths: ["apps/web/src/roadmap/roadmapLiveState.ts"],
  },
  {
    id: "roadmap-sidebar",
    label: "Roadmap sidebar entry",
    contains: {
      path: "apps/web/src/components/Sidebar.tsx",
      needle: 'navigate({ to: "/roadmap" })',
    },
  },
  {
    id: "roadmap-auto-tracking",
    label: "Automatic roadmap progress tracking",
    requiredPaths: ["apps/server/src/roadmapStatus.ts", "docs/t3code-parity-scheduled-runbook.md"],
  },
] as const;

const DEFAULT_VALIDATION_CHECKS: readonly ValidationArtifactCheck[] = [
  { id: "fmt", label: "bun fmt", status: "unknown" },
  { id: "lint", label: "bun lint", status: "unknown" },
  { id: "typecheck", label: "bun typecheck", status: "unknown" },
  { id: "test", label: "bun run test", status: "unknown" },
] as const;

const ROADMAP_VALIDATION_ARTIFACT_PATH = ".artifacts/roadmap/latest-validation.json";

async function pathExists(root: string, relativePath: string): Promise<boolean> {
  try {
    await FS.access(Path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function fileContains(root: string, relativePath: string, needle: string): Promise<boolean> {
  try {
    const contents = await FS.readFile(Path.join(root, relativePath), "utf8");
    return contents.includes(needle);
  } catch {
    return false;
  }
}

async function readValidationArtifact(root: string): Promise<ValidationArtifact | null> {
  try {
    const raw = await FS.readFile(Path.join(root, ROADMAP_VALIDATION_ARTIFACT_PATH), "utf8");
    return JSON.parse(raw) as ValidationArtifact;
  } catch {
    return null;
  }
}

export async function getRoadmapStatus(input: {
  readonly cwd: string;
}): Promise<ServerGetRoadmapStatusResult> {
  const infrastructure = await Promise.all(
    INFRASTRUCTURE_RULES.map(async (rule) => {
      if (rule.requiredPaths) {
        const completions = await Promise.all(
          rule.requiredPaths.map(async (relativePath) => ({
            relativePath,
            exists: await pathExists(input.cwd, relativePath),
          })),
        );
        return {
          id: rule.id,
          label: rule.label,
          completed: completions.every((entry) => entry.exists),
          evidence: completions.filter((entry) => entry.exists).map((entry) => entry.relativePath),
        };
      }

      const contains = rule.contains
        ? await fileContains(input.cwd, rule.contains.path, rule.contains.needle)
        : false;
      return {
        id: rule.id,
        label: rule.label,
        completed: contains,
        evidence: contains && rule.contains ? [rule.contains.path] : [],
      };
    }),
  );

  const subtasks = await Promise.all(
    ROADMAP_SUBTASK_RULES.map(async (rule) => {
      const completions = await Promise.all(
        rule.requiredPaths.map(async (relativePath) => ({
          relativePath,
          exists: await pathExists(input.cwd, relativePath),
        })),
      );
      return {
        subtaskId: rule.subtaskId,
        trackingMode: "automatic" as const,
        completed: completions.every((entry) => entry.exists),
        evidence: completions.filter((entry) => entry.exists).map((entry) => entry.relativePath),
      };
    }),
  );

  const artifact = await readValidationArtifact(input.cwd);
  const validations = DEFAULT_VALIDATION_CHECKS.map((defaultCheck) => {
    const override = artifact?.checks?.find((check) => check.id === defaultCheck.id);
    const validation = {
      id: defaultCheck.id,
      label: defaultCheck.label,
      status: override?.status ?? defaultCheck.status,
    } as {
      id: (typeof defaultCheck)["id"];
      label: string;
      status: "unknown" | "pass" | "fail";
      detail?: string;
      updatedAt?: string;
    };
    if (override?.detail) {
      validation.detail = override.detail;
    }
    if (override?.updatedAt) {
      validation.updatedAt = override.updatedAt;
    }
    return validation;
  });

  return {
    generatedAt: new Date().toISOString(),
    infrastructure,
    subtasks,
    validations,
  };
}
