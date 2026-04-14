import type { ServerGetRoadmapStatusResult } from "@t3tools/contracts";

export interface RoadmapAutomatedSubtaskState {
  readonly completed: boolean;
  readonly evidence: readonly string[];
  readonly trackingMode: "automatic" | "manual-only";
}

export function indexRoadmapAutomatedSubtasks(
  status: ServerGetRoadmapStatusResult | undefined,
): Readonly<Record<string, RoadmapAutomatedSubtaskState>> {
  const entries = status?.subtasks ?? [];
  return Object.fromEntries(
    entries.map((entry) => [
      entry.subtaskId,
      {
        completed: entry.completed,
        evidence: entry.evidence,
        trackingMode: entry.trackingMode,
      } satisfies RoadmapAutomatedSubtaskState,
    ]),
  );
}

export function isRoadmapSubtaskAutomaticallyCompleted(
  subtaskId: string,
  automatedSubtasks: Readonly<Record<string, RoadmapAutomatedSubtaskState>>,
): boolean {
  return automatedSubtasks[subtaskId]?.completed === true;
}

export function isRoadmapSubtaskEffectivelyCompleted(input: {
  readonly subtaskId: string;
  readonly checklistState: Readonly<Record<string, boolean>>;
  readonly automatedSubtasks: Readonly<Record<string, RoadmapAutomatedSubtaskState>>;
}): boolean {
  return (
    input.checklistState[input.subtaskId] === true ||
    isRoadmapSubtaskAutomaticallyCompleted(input.subtaskId, input.automatedSubtasks)
  );
}

export function deriveRoadmapAutomationSummary(status: ServerGetRoadmapStatusResult | undefined) {
  const infrastructure = status?.infrastructure ?? [];
  const automatedSubtasks = status?.subtasks ?? [];
  const validations = status?.validations ?? [];

  return {
    generatedAt: status?.generatedAt ?? null,
    infrastructureCount: infrastructure.length,
    completedInfrastructureCount: infrastructure.filter((entry) => entry.completed).length,
    automatedSubtaskCount: automatedSubtasks.length,
    completedAutomatedSubtaskCount: automatedSubtasks.filter((entry) => entry.completed).length,
    validationChecks: validations,
    passingValidationCount: validations.filter((entry) => entry.status === "pass").length,
    failingValidationCount: validations.filter((entry) => entry.status === "fail").length,
  };
}
