import { MessageId, ProjectId, ThreadId, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { buildThreadStatusDiagnosticEntries } from "./threadStatusDiagnostics";
import type { AppState } from "./store";
import type { Thread } from "./types";
import type { UiState } from "./uiStateStore";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: ThreadId.makeUnsafe("thread-1"),
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe("project-1"),
    title: "Thread",
    modelSelection: { provider: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-04-14T00:00:00.000Z",
    archivedAt: null,
    updatedAt: "2026-04-14T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
    ...overrides,
  };
}

function makeUiState(partial: Partial<UiState> = {}): UiState {
  return {
    pinnedThreadIds: [],
    projectExpandedById: {},
    projectOrder: [],
    projectTasksById: {},
    threadLastVisitedAtById: {},
    threadCompletionOverrideById: {},
    threadEnvModeById: {},
    ...partial,
  };
}

describe("buildThreadStatusDiagnosticEntries", () => {
  it("records completed status for a manually completed thread even when the same turn still looks running", () => {
    const thread = makeThread({
      latestTurn: {
        turnId: TurnId.makeUnsafe("turn-1"),
        state: "running",
        requestedAt: "2026-04-14T00:00:01.000Z",
        startedAt: "2026-04-14T00:00:02.000Z",
        completedAt: null,
        assistantMessageId: MessageId.makeUnsafe("assistant-1"),
      },
      session: {
        provider: "codex",
        status: "running",
        orchestrationStatus: "running",
        activeTurnId: TurnId.makeUnsafe("turn-1"),
        createdAt: "2026-04-14T00:00:00.000Z",
        updatedAt: "2026-04-14T00:00:03.000Z",
      },
      messages: [
        {
          id: MessageId.makeUnsafe("user-1"),
          role: "user",
          text: "start",
          createdAt: "2026-04-14T00:00:01.000Z",
          completedAt: "2026-04-14T00:00:01.000Z",
          streaming: false,
        },
        {
          id: MessageId.makeUnsafe("assistant-1"),
          role: "assistant",
          text: "working",
          turnId: TurnId.makeUnsafe("turn-1"),
          createdAt: "2026-04-14T00:00:03.000Z",
          streaming: true,
        },
      ],
    });

    const appState: AppState = {
      projects: [],
      threads: [thread],
      sidebarThreadsById: {
        [thread.id]: {
          id: thread.id,
          projectId: thread.projectId,
          title: thread.title,
          interactionMode: thread.interactionMode,
          session: thread.session,
          createdAt: thread.createdAt,
          archivedAt: thread.archivedAt,
          updatedAt: thread.updatedAt,
          latestTurn: thread.latestTurn,
          branch: thread.branch,
          worktreePath: thread.worktreePath,
          latestUserMessageAt: thread.messages[0]?.createdAt ?? null,
          hasPendingApprovals: false,
          hasPendingUserInput: false,
          hasActionableProposedPlan: false,
          isRunningTurn: true,
        },
      },
      threadIdsByProjectId: {
        [thread.projectId]: [thread.id],
      },
      bootstrapComplete: true,
    };

    const entries = buildThreadStatusDiagnosticEntries({
      appState,
      uiState: makeUiState({
        threadCompletionOverrideById: {
          [thread.id]: {
            turnId: TurnId.makeUnsafe("turn-1"),
            completedAt: null,
          },
        },
      }),
    });

    const snapshot = entries.get(thread.id)?.snapshot;
    expect(snapshot?.statusLabel).toBe("Completed");
    expect(snapshot?.decisionReason).toBe("manual-complete");
    expect(snapshot?.messages.previousMessage?.id).toBe(MessageId.makeUnsafe("user-1"));
    expect(snapshot?.messages.anchorMessage?.id).toBe(MessageId.makeUnsafe("assistant-1"));
  });

  it("records completed status for a manually completed settled turn", () => {
    const thread = makeThread({
      latestTurn: {
        turnId: TurnId.makeUnsafe("turn-1"),
        state: "completed",
        requestedAt: "2026-04-14T00:00:01.000Z",
        startedAt: "2026-04-14T00:00:02.000Z",
        completedAt: "2026-04-14T00:00:05.000Z",
        assistantMessageId: MessageId.makeUnsafe("assistant-1"),
      },
      messages: [
        {
          id: MessageId.makeUnsafe("assistant-1"),
          role: "assistant",
          text: "done",
          turnId: TurnId.makeUnsafe("turn-1"),
          createdAt: "2026-04-14T00:00:05.000Z",
          completedAt: "2026-04-14T00:00:05.000Z",
          streaming: false,
        },
      ],
    });

    const entries = buildThreadStatusDiagnosticEntries({
      appState: {
        projects: [],
        threads: [thread],
        sidebarThreadsById: {
          [thread.id]: {
            id: thread.id,
            projectId: thread.projectId,
            title: thread.title,
            interactionMode: thread.interactionMode,
            session: thread.session,
            createdAt: thread.createdAt,
            archivedAt: thread.archivedAt,
            updatedAt: thread.updatedAt,
            latestTurn: thread.latestTurn,
            branch: thread.branch,
            worktreePath: thread.worktreePath,
            latestUserMessageAt: null,
            hasPendingApprovals: false,
            hasPendingUserInput: false,
            hasActionableProposedPlan: false,
            isRunningTurn: false,
          },
        },
        threadIdsByProjectId: {
          [thread.projectId]: [thread.id],
        },
        bootstrapComplete: true,
      },
      uiState: makeUiState({
        threadCompletionOverrideById: {
          [thread.id]: {
            turnId: TurnId.makeUnsafe("turn-1"),
            completedAt: "2026-04-14T00:00:05.000Z",
          },
        },
      }),
    });

    const snapshot = entries.get(thread.id)?.snapshot;
    expect(snapshot?.statusLabel).toBe("Completed");
    expect(snapshot?.decisionReason).toBe("manual-complete");
  });
});
