import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { roadmapFeatures } from "../roadmap/roadmapData";
import { deriveRoadmapDashboardSummary } from "../roadmap/roadmapLogic";
import { RoadmapDashboardView } from "./RoadmapDashboard";

describe("RoadmapDashboardView", () => {
  it("renders roadmap items, subtasks, and live feed summaries", () => {
    const currentFocusFeature = roadmapFeatures.find((feature) => feature.isCurrentFocus);
    const features = currentFocusFeature
      ? [roadmapFeatures[0]!, currentFocusFeature]
      : roadmapFeatures.slice(0, 2);
    const markup = renderToStaticMarkup(
      <RoadmapDashboardView
        automationError={null}
        automationLoading={false}
        automatedSubtasks={{
          "contracts-auth-port": {
            completed: true,
            evidence: ["packages/contracts/src/auth.ts"],
            trackingMode: "automatic",
          },
        }}
        automationSummary={{
          generatedAt: "2026-04-13T12:05:00.000Z",
          infrastructureCount: 2,
          completedInfrastructureCount: 2,
          automatedSubtaskCount: 1,
          completedAutomatedSubtaskCount: 1,
          validationChecks: [{ id: "fmt", label: "bun fmt", status: "pass" }],
          passingValidationCount: 1,
          failingValidationCount: 0,
        }}
        checklistState={{ "auth-bootstrap-persist-contracts": true }}
        connectionStatus={{
          attemptCount: 1,
          closeCode: null,
          closeReason: null,
          connectedAt: "2026-04-13T12:00:00.000Z",
          disconnectedAt: null,
          hasConnected: true,
          lastError: null,
          lastErrorAt: null,
          nextRetryAt: null,
          online: true,
          phase: "connected",
          reconnectAttemptCount: 0,
          reconnectMaxAttempts: 8,
          reconnectPhase: "idle",
          socketUrl: "ws://localhost:5733",
        }}
        filteredFeatures={features}
        infrastructureChecks={[
          {
            id: "roadmap-route",
            label: "Roadmap route",
            completed: true,
            evidence: ["apps/web/src/routes/roadmap.tsx"],
          },
        ]}
        liveEvents={[
          {
            id: "event-1",
            sequence: 42,
            type: "thread.created",
            occurredAt: "2026-04-13T12:02:00.000Z",
            aggregateKind: "thread",
            aggregateId: "thread-1",
            summary: "Thread created: Port pairing flow",
          },
        ]}
        searchQuery=""
        summary={deriveRoadmapDashboardSummary({
          features,
          checklistState: { "auth-bootstrap-persist-contracts": true },
          threads: [
            {
              archivedAt: null,
              interactionMode: "default",
              latestTurn: null,
              session: null,
            },
          ],
          projectCount: 1,
          liveEvents: [
            {
              id: "event-1",
              sequence: 42,
              type: "thread.created",
              occurredAt: "2026-04-13T12:02:00.000Z",
              aggregateKind: "thread",
              aggregateId: "thread-1",
              summary: "Thread created: Port pairing flow",
            },
          ],
        })}
        onRefreshStatus={() => {}}
        refreshDisabled={false}
        onSearchQueryChange={() => {}}
        onResetSearch={() => {}}
        onToggleSubtask={() => {}}
      />,
    );

    expect(markup).toContain("Parity control center");
    expect(markup).toContain("Refresh status");
    expect(markup).toContain("Currently in progress");
    expect(markup).toContain("Active action item: ");
    expect(markup).toContain("Port runtime state and orchestration HTTP modules");
    expect(markup).toContain("docs/t3code-parity-scheduled-runbook.md");
    expect(markup).toContain("Scheduled execution loop");
    expect(markup).toContain("Auth bootstrap, secret storage, and pairing control plane");
    expect(markup).toContain("Port auth/bootstrap contracts and persistence schemas");
    expect(markup).toContain("Thread created: Port pairing flow");
  });
});
