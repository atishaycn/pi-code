import {
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
} from "@t3tools/shared/searchRanking";

import type { RoadmapFeature } from "./roadmapData";
import type { RoadmapLiveEvent } from "./roadmapLiveState";

export interface RoadmapChecklistSummary {
  completedCount: number;
  totalCount: number;
  completionRatio: number;
}

export interface RoadmapDashboardSummary {
  featureCount: number;
  completedSubtaskCount: number;
  totalSubtaskCount: number;
  completionRatio: number;
  projectCount: number;
  threadCount: number;
  archivedThreadCount: number;
  runningThreadCount: number;
  plannedThreadCount: number;
  recentEventCount: number;
  latestEventSequence: number | null;
}

export function getRoadmapChecklistSummary(
  feature: RoadmapFeature,
  checklistState: Readonly<Record<string, boolean>>,
  automatedSubtasks: Readonly<Record<string, boolean>> = {},
): RoadmapChecklistSummary {
  const totalCount = feature.subtasks.length;
  const completedCount = feature.subtasks.reduce(
    (count, subtask) =>
      count + (checklistState[subtask.id] || automatedSubtasks[subtask.id] ? 1 : 0),
    0,
  );

  return {
    completedCount,
    totalCount,
    completionRatio: totalCount === 0 ? 0 : completedCount / totalCount,
  };
}

export function filterRoadmapFeatures(
  features: ReadonlyArray<RoadmapFeature>,
  query: string,
): RoadmapFeature[] {
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery.length === 0) {
    return [...features];
  }

  const ranked: Array<{
    item: RoadmapFeature;
    score: number;
    tieBreaker: string;
  }> = [];

  for (const feature of features) {
    const fields = [
      feature.title,
      feature.category,
      feature.priority,
      feature.summary,
      ...feature.evidence,
      ...feature.implementationPlan,
      ...feature.testPlan,
      feature.subagentArchitecture.coordinator,
      ...feature.subagentArchitecture.workers,
      ...feature.subagentArchitecture.validation,
      ...feature.subtasks.map((subtask) => subtask.label),
    ];

    const scores = fields
      .map((value, index) =>
        scoreQueryMatch({
          value: normalizeSearchQuery(value),
          query: normalizedQuery,
          exactBase: index * 100,
          prefixBase: index * 100 + 2,
          boundaryBase: index * 100 + 4,
          includesBase: index * 100 + 6,
          fuzzyBase: index * 100 + 100,
        }),
      )
      .filter((value): value is number => value !== null);

    if (scores.length === 0) {
      continue;
    }

    insertRankedSearchResult(
      ranked,
      {
        item: feature,
        score: Math.min(...scores),
        tieBreaker: `${feature.priority}\u0000${feature.title.toLowerCase()}\u0000${feature.id}`,
      },
      features.length,
    );
  }

  return ranked.map((entry) => entry.item);
}

export function deriveRoadmapDashboardSummary(input: {
  features: ReadonlyArray<RoadmapFeature>;
  checklistState: Readonly<Record<string, boolean>>;
  threads: ReadonlyArray<{
    archivedAt: string | null;
    interactionMode: "default" | "plan";
    latestTurn: { state: "running" | "interrupted" | "completed" | "error" } | null;
    session: {
      orchestrationStatus:
        | "idle"
        | "starting"
        | "running"
        | "ready"
        | "interrupted"
        | "stopped"
        | "error";
    } | null;
  }>;
  projectCount: number;
  liveEvents: ReadonlyArray<RoadmapLiveEvent>;
  automatedSubtasks?: Readonly<Record<string, boolean>>;
}): RoadmapDashboardSummary {
  const totalSubtaskCount = input.features.reduce(
    (count, feature) => count + feature.subtasks.length,
    0,
  );
  const completedSubtaskCount = input.features.reduce(
    (count, feature) =>
      count +
      getRoadmapChecklistSummary(feature, input.checklistState, input.automatedSubtasks)
        .completedCount,
    0,
  );

  const archivedThreadCount = input.threads.filter((thread) => thread.archivedAt !== null).length;
  const runningThreadCount = input.threads.filter(
    (thread) =>
      thread.archivedAt === null &&
      (thread.latestTurn?.state === "running" || thread.session?.orchestrationStatus === "running"),
  ).length;
  const plannedThreadCount = input.threads.filter(
    (thread) => thread.archivedAt === null && thread.interactionMode === "plan",
  ).length;
  const latestEventSequence = input.liveEvents[0]?.sequence ?? null;

  return {
    featureCount: input.features.length,
    completedSubtaskCount,
    totalSubtaskCount,
    completionRatio: totalSubtaskCount === 0 ? 0 : completedSubtaskCount / totalSubtaskCount,
    projectCount: input.projectCount,
    threadCount: input.threads.length,
    archivedThreadCount,
    runningThreadCount,
    plannedThreadCount,
    recentEventCount: input.liveEvents.length,
    latestEventSequence,
  };
}

export function formatRoadmapPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
