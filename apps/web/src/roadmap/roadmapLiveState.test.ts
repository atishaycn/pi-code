import {
  EventId,
  MessageId,
  ProjectId,
  ThreadId,
  type OrchestrationEvent,
  TurnId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { summarizeOrchestrationEvent } from "./roadmapLiveState";

describe("roadmapLiveState", () => {
  it("summarizes streaming message events clearly", () => {
    const event: OrchestrationEvent = {
      sequence: 7,
      eventId: EventId.makeUnsafe("event-7"),
      aggregateKind: "thread",
      aggregateId: ThreadId.makeUnsafe("thread-1"),
      occurredAt: "2026-04-13T12:00:00.000Z",
      commandId: null,
      causationEventId: null,
      correlationId: null,
      metadata: {},
      type: "thread.message-sent",
      payload: {
        threadId: ThreadId.makeUnsafe("thread-1"),
        messageId: MessageId.makeUnsafe("message-1"),
        role: "assistant",
        text: "Hello",
        turnId: TurnId.makeUnsafe("turn-1"),
        streaming: true,
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:01.000Z",
      },
    };

    expect(summarizeOrchestrationEvent(event)).toBe("Assistant message streaming");
  });

  it("summarizes project creation with the project title", () => {
    const event: OrchestrationEvent = {
      sequence: 3,
      eventId: EventId.makeUnsafe("event-3"),
      aggregateKind: "project",
      aggregateId: ProjectId.makeUnsafe("project-1"),
      occurredAt: "2026-04-13T12:00:00.000Z",
      commandId: null,
      causationEventId: null,
      correlationId: null,
      metadata: {},
      type: "project.created",
      payload: {
        projectId: ProjectId.makeUnsafe("project-1"),
        title: "Main repo",
        workspaceRoot: "/repo",
        defaultModelSelection: null,
        scripts: [],
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
    };

    expect(summarizeOrchestrationEvent(event)).toBe("Project created: Main repo");
  });
});
