import { describe, expect, it } from "vitest";

import { roadmapFeatures } from "./roadmapData";
import {
  deriveRoadmapDashboardSummary,
  filterRoadmapFeatures,
  formatRoadmapPercent,
  getRoadmapChecklistSummary,
} from "./roadmapLogic";

describe("roadmapLogic", () => {
  it("counts completed subtasks for a feature", () => {
    const feature = roadmapFeatures[0]!;

    expect(
      getRoadmapChecklistSummary(
        feature,
        {
          "auth-bootstrap-persist-contracts": true,
        },
        {
          "auth-bootstrap-validation": true,
        },
      ),
    ).toEqual({
      completedCount: 2,
      totalCount: 4,
      completionRatio: 0.5,
    });
  });

  it("filters roadmap items by plan, evidence, and sub-agent text", () => {
    expect(
      filterRoadmapFeatures(roadmapFeatures, "window-controls overlay").map((item) => item.id),
    ).toEqual(["window-controls-overlay"]);
    expect(filterRoadmapFeatures(roadmapFeatures, "bootstrap secret")[0]?.id).toBe(
      "auth-bootstrap-pairing",
    );
    expect(filterRoadmapFeatures(roadmapFeatures, "reviewer").length).toBeGreaterThan(3);
  });

  it("derives dashboard summary metrics from roadmap, threads, and live events", () => {
    const summary = deriveRoadmapDashboardSummary({
      features: roadmapFeatures.slice(0, 2),
      checklistState: {
        "auth-bootstrap-persist-contracts": true,
        "contracts-auth-port": true,
        "contracts-env-port": true,
      },
      threads: [
        {
          archivedAt: null,
          interactionMode: "plan",
          latestTurn: { state: "running" },
          session: { orchestrationStatus: "running" },
        },
        {
          archivedAt: "2026-04-13T12:05:00.000Z",
          interactionMode: "default",
          latestTurn: null,
          session: null,
        },
      ],
      projectCount: 3,
      automatedSubtasks: {
        "contracts-tests": true,
      },
      liveEvents: [
        {
          id: "event-2",
          sequence: 52,
          type: "thread.created",
          occurredAt: "2026-04-13T12:02:00.000Z",
          aggregateKind: "thread",
          aggregateId: "thread-2",
          summary: "Thread created",
        },
      ],
    });

    expect(summary).toMatchObject({
      featureCount: 2,
      completedSubtaskCount: 4,
      totalSubtaskCount: 7,
      projectCount: 3,
      threadCount: 2,
      archivedThreadCount: 1,
      runningThreadCount: 1,
      plannedThreadCount: 1,
      recentEventCount: 1,
      latestEventSequence: 52,
    });
  });

  it("formats percentages with sensible clamping", () => {
    expect(formatRoadmapPercent(0.374)).toBe("37%");
    expect(formatRoadmapPercent(2)).toBe("100%");
    expect(formatRoadmapPercent(-1)).toBe("0%");
  });
});
