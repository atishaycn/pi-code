import type { OrchestrationEvent } from "@t3tools/contracts";
import { create } from "zustand";

export interface RoadmapLiveEvent {
  id: string;
  sequence: number;
  type: OrchestrationEvent["type"];
  occurredAt: string;
  aggregateKind: OrchestrationEvent["aggregateKind"];
  aggregateId: string;
  summary: string;
}

interface RoadmapLiveState {
  recentEvents: RoadmapLiveEvent[];
  recordEvents: (events: ReadonlyArray<OrchestrationEvent>) => void;
  reset: () => void;
}

const MAX_ROADMAP_LIVE_EVENTS = 40;

function summarizeOrchestrationEvent(event: OrchestrationEvent): string {
  switch (event.type) {
    case "project.created":
      return `Project created: ${event.payload.title}`;
    case "project.meta-updated":
      return `Project metadata updated: ${event.payload.title}`;
    case "project.deleted":
      return `Project deleted`;
    case "thread.created":
      return `Thread created: ${event.payload.title}`;
    case "thread.deleted":
      return "Thread deleted";
    case "thread.archived":
      return "Thread archived";
    case "thread.unarchived":
      return "Thread restored from archive";
    case "thread.meta-updated":
      return `Thread renamed: ${event.payload.title}`;
    case "thread.runtime-mode-set":
      return `Runtime mode set to ${event.payload.runtimeMode}`;
    case "thread.interaction-mode-set":
      return `Interaction mode set to ${event.payload.interactionMode}`;
    case "thread.message-sent":
      return event.payload.streaming
        ? `${capitalize(event.payload.role)} message streaming`
        : `${capitalize(event.payload.role)} message committed`;
    case "thread.turn-start-requested":
      return `Turn requested (${event.payload.interactionMode})`;
    case "thread.turn-interrupt-requested":
      return "Turn interrupt requested";
    case "thread.approval-response-requested":
      return `Approval response: ${event.payload.decision}`;
    case "thread.user-input-response-requested":
      return "User input response submitted";
    case "thread.checkpoint-revert-requested":
      return `Checkpoint revert requested (${event.payload.turnCount})`;
    case "thread.reverted":
      return `Thread reverted to turn ${event.payload.turnCount}`;
    case "thread.session-stop-requested":
      return "Session stop requested";
    case "thread.session-set":
      return `Session state: ${event.payload.session.status}`;
    case "thread.proposed-plan-upserted":
      return `Plan updated: ${trimSummary(event.payload.proposedPlan.planMarkdown)}`;
    case "thread.turn-diff-completed":
      return `Turn diff completed (${event.payload.files.length} files)`;
    case "thread.activity-appended":
      return `${capitalize(event.payload.activity.tone)}: ${event.payload.activity.summary}`;
  }
}

function trimSummary(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 48) return normalized;
  return `${normalized.slice(0, 45)}…`;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

function toRoadmapLiveEvent(event: OrchestrationEvent): RoadmapLiveEvent {
  return {
    id: event.eventId,
    sequence: event.sequence,
    type: event.type,
    occurredAt: event.occurredAt,
    aggregateKind: event.aggregateKind,
    aggregateId: event.aggregateId,
    summary: summarizeOrchestrationEvent(event),
  };
}

export const useRoadmapLiveState = create<RoadmapLiveState>((set) => ({
  recentEvents: [],
  recordEvents: (events) => {
    if (events.length === 0) return;

    set((state) => {
      const seen = new Set(state.recentEvents.map((event) => event.id));
      const appended = events.map(toRoadmapLiveEvent).filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      });

      if (appended.length === 0) {
        return state;
      }

      return {
        recentEvents: [...appended.toReversed(), ...state.recentEvents].slice(
          0,
          MAX_ROADMAP_LIVE_EVENTS,
        ),
      };
    });
  },
  reset: () => set({ recentEvents: [] }),
}));

export { summarizeOrchestrationEvent };
