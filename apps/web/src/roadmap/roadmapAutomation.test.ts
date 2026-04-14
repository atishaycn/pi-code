import type { ServerGetRoadmapStatusResult } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  deriveRoadmapAutomationSummary,
  indexRoadmapAutomatedSubtasks,
  isRoadmapSubtaskAutomaticallyCompleted,
  isRoadmapSubtaskEffectivelyCompleted,
} from "./roadmapAutomation";

describe("roadmapAutomation", () => {
  const status = {
    generatedAt: "2026-04-13T20:30:00.000Z",
    infrastructure: [
      {
        id: "route",
        label: "Roadmap route",
        completed: true,
        evidence: ["apps/web/src/routes/roadmap.tsx"],
      },
      { id: "sidebar", label: "Sidebar entry", completed: false, evidence: [] },
    ],
    subtasks: [
      {
        subtaskId: "contracts-auth-port",
        trackingMode: "automatic" as const,
        completed: true,
        evidence: ["packages/contracts/src/auth.ts"],
      },
      {
        subtaskId: "contracts-tests",
        trackingMode: "automatic" as const,
        completed: false,
        evidence: [],
      },
    ],
    validations: [
      { id: "fmt", label: "bun fmt", status: "pass" as const },
      { id: "lint", label: "bun lint", status: "unknown" as const },
    ],
  } satisfies ServerGetRoadmapStatusResult;

  it("indexes automated subtasks by id", () => {
    const indexed = indexRoadmapAutomatedSubtasks(status);
    expect(indexed["contracts-auth-port"]?.completed).toBe(true);
    expect(indexed["contracts-tests"]?.trackingMode).toBe("automatic");
  });

  it("merges manual and automatic completion", () => {
    const automated = indexRoadmapAutomatedSubtasks(status);

    expect(isRoadmapSubtaskAutomaticallyCompleted("contracts-auth-port", automated)).toBe(true);
    expect(
      isRoadmapSubtaskEffectivelyCompleted({
        subtaskId: "contracts-tests",
        checklistState: { "contracts-tests": true },
        automatedSubtasks: automated,
      }),
    ).toBe(true);
  });

  it("derives automation summary metrics", () => {
    expect(deriveRoadmapAutomationSummary(status)).toMatchObject({
      infrastructureCount: 2,
      completedInfrastructureCount: 1,
      automatedSubtaskCount: 2,
      completedAutomatedSubtaskCount: 1,
      passingValidationCount: 1,
      failingValidationCount: 0,
    });
  });
});
