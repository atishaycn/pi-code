import { ProjectId, ThreadId, TurnId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import {
  addProjectTask,
  clearThreadCompletionOverride,
  clearThreadUi,
  markThreadCompleted,
  markThreadUnread,
  matchesThreadCompletionOverride,
  removeProjectTask,
  reorderProjects,
  resetUiStatePersistenceForTests,
  setProjectExpanded,
  setThreadEnvMode,
  syncProjects,
  syncThreads,
  togglePinnedThread,
  toggleProjectTask,
  type UiState,
} from "./uiStateStore";

function makeUiState(overrides: Partial<UiState> = {}): UiState {
  return {
    projectExpandedById: {},
    projectOrder: [],
    projectTasksById: {},
    pinnedThreadIds: [],
    threadLastVisitedAtById: {},
    threadCompletionOverrideById: {},
    threadEnvModeById: {},
    ...overrides,
  };
}

describe("uiStateStore pure functions", () => {
  beforeEach(() => {
    resetUiStatePersistenceForTests();
  });

  it("markThreadUnread moves lastVisitedAt before completion for a completed thread", () => {
    const threadId = ThreadId.makeUnsafe("thread-1");
    const latestTurnCompletedAt = "2026-02-25T12:30:00.000Z";
    const initialState = makeUiState({
      threadLastVisitedAtById: {
        [threadId]: "2026-02-25T12:35:00.000Z",
      },
    });

    const next = markThreadUnread(initialState, threadId, latestTurnCompletedAt);

    expect(next.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:29:59.999Z");
  });

  it("markThreadUnread does not change a thread without a completed turn", () => {
    const threadId = ThreadId.makeUnsafe("thread-1");
    const initialState = makeUiState({
      threadLastVisitedAtById: {
        [threadId]: "2026-02-25T12:35:00.000Z",
      },
    });

    const next = markThreadUnread(initialState, threadId, null);

    expect(next).toBe(initialState);
  });

  it("reorderProjects moves a project to a target index", () => {
    const project1 = ProjectId.makeUnsafe("project-1");
    const project2 = ProjectId.makeUnsafe("project-2");
    const project3 = ProjectId.makeUnsafe("project-3");
    const initialState = makeUiState({
      projectOrder: [project1, project2, project3],
    });

    const next = reorderProjects(initialState, project1, project3);

    expect(next.projectOrder).toEqual([project2, project3, project1]);
  });

  it("syncProjects preserves current project order during snapshot recovery", () => {
    const project1 = ProjectId.makeUnsafe("project-1");
    const project2 = ProjectId.makeUnsafe("project-2");
    const project3 = ProjectId.makeUnsafe("project-3");
    const initialState = makeUiState({
      projectExpandedById: {
        [project1]: true,
        [project2]: false,
      },
      projectOrder: [project2, project1],
    });

    const next = syncProjects(initialState, [
      { id: project1, cwd: "/tmp/project-1" },
      { id: project2, cwd: "/tmp/project-2" },
      { id: project3, cwd: "/tmp/project-3" },
    ]);

    expect(next.projectOrder).toEqual([project2, project1, project3]);
    expect(next.projectExpandedById[project2]).toBe(false);
  });

  it("syncProjects preserves manual order when a project is recreated with the same cwd", () => {
    const oldProject1 = ProjectId.makeUnsafe("project-1");
    const oldProject2 = ProjectId.makeUnsafe("project-2");
    const recreatedProject2 = ProjectId.makeUnsafe("project-2b");
    const initialState = syncProjects(
      makeUiState({
        projectExpandedById: {
          [oldProject1]: true,
          [oldProject2]: false,
        },
        projectOrder: [oldProject2, oldProject1],
      }),
      [
        { id: oldProject1, cwd: "/tmp/project-1" },
        { id: oldProject2, cwd: "/tmp/project-2" },
      ],
    );

    const next = syncProjects(initialState, [
      { id: oldProject1, cwd: "/tmp/project-1" },
      { id: recreatedProject2, cwd: "/tmp/project-2" },
    ]);

    expect(next.projectOrder).toEqual([recreatedProject2, oldProject1]);
    expect(next.projectExpandedById[recreatedProject2]).toBe(false);
  });

  it("syncProjects returns a new state when only project cwd changes", () => {
    const project1 = ProjectId.makeUnsafe("project-1");
    const initialState = syncProjects(
      makeUiState({
        projectExpandedById: {
          [project1]: false,
        },
        projectOrder: [project1],
      }),
      [{ id: project1, cwd: "/tmp/project-1" }],
    );

    const next = syncProjects(initialState, [{ id: project1, cwd: "/tmp/project-1-renamed" }]);

    expect(next).not.toBe(initialState);
    expect(next.projectOrder).toEqual([project1]);
    expect(next.projectExpandedById[project1]).toBe(false);
  });

  it("markThreadCompleted stores a manual completion override for the current turn", () => {
    const threadId = ThreadId.makeUnsafe("thread-1");
    const next = markThreadCompleted(makeUiState(), threadId, {
      turnId: TurnId.makeUnsafe("turn-1"),
      completedAt: "2026-02-25T12:30:00.000Z",
    });

    expect(next.threadCompletionOverrideById[threadId]).toEqual({
      turnId: TurnId.makeUnsafe("turn-1"),
      completedAt: "2026-02-25T12:30:00.000Z",
    });
  });

  it("syncThreads marks existing threads completed once during the initial migration", () => {
    const thread1 = ThreadId.makeUnsafe("thread-1");
    const next = syncThreads(makeUiState(), [
      {
        id: thread1,
        seedVisitedAt: "2026-02-25T12:35:00.000Z",
        latestTurn: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: "2026-02-25T12:34:00.000Z",
        },
      },
    ]);

    expect(next.threadCompletionOverrideById[thread1]).toEqual({
      turnId: TurnId.makeUnsafe("turn-1"),
      completedAt: "2026-02-25T12:34:00.000Z",
    });
  });

  it("syncThreads clears a completion override after the thread advances to a new turn", () => {
    const thread1 = ThreadId.makeUnsafe("thread-1");
    const migratedState = syncThreads(makeUiState(), []);
    const initialState = {
      ...migratedState,
      threadCompletionOverrideById: {
        [thread1]: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: "2026-02-25T12:34:00.000Z",
        },
      },
    } satisfies UiState;

    const next = syncThreads(initialState, [
      {
        id: thread1,
        latestTurn: {
          turnId: TurnId.makeUnsafe("turn-2"),
          completedAt: null,
        },
      },
    ]);

    expect(next.threadCompletionOverrideById).toEqual({});
  });

  it("setThreadEnvMode stores per-thread environment preferences and syncThreads clears stale ones", () => {
    const thread1 = ThreadId.makeUnsafe("thread-1");
    const thread2 = ThreadId.makeUnsafe("thread-2");
    const stateWithModes = setThreadEnvMode(
      setThreadEnvMode(makeUiState(), thread1, "worktree"),
      thread2,
      "local",
    );

    expect(stateWithModes.threadEnvModeById).toEqual({
      [thread1]: "worktree",
      [thread2]: "local",
    });

    const next = syncThreads(stateWithModes, [{ id: thread2 }]);
    expect(next.threadEnvModeById).toEqual({
      [thread2]: "local",
    });
  });

  it("matchesThreadCompletionOverride only when the current latest turn still matches", () => {
    expect(
      matchesThreadCompletionOverride({
        latestTurn: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: "2026-02-25T12:30:00.000Z",
        },
        override: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: "2026-02-25T12:30:00.000Z",
        },
      }),
    ).toBe(true);
    expect(
      matchesThreadCompletionOverride({
        latestTurn: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: "2026-02-25T12:31:00.000Z",
        },
        override: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: null,
        },
      }),
    ).toBe(true);
    expect(
      matchesThreadCompletionOverride({
        latestTurn: {
          turnId: TurnId.makeUnsafe("turn-2"),
          completedAt: "2026-02-25T12:30:00.000Z",
        },
        override: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: "2026-02-25T12:30:00.000Z",
        },
      }),
    ).toBe(false);
    expect(
      matchesThreadCompletionOverride({
        latestTurn: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: null,
        },
        override: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: "2026-02-25T12:30:00.000Z",
        },
      }),
    ).toBe(false);
  });

  it("syncThreads prunes missing thread UI state", () => {
    const thread1 = ThreadId.makeUnsafe("thread-1");
    const thread2 = ThreadId.makeUnsafe("thread-2");
    const initialState = makeUiState({
      pinnedThreadIds: [thread1, thread2],
      threadLastVisitedAtById: {
        [thread1]: "2026-02-25T12:35:00.000Z",
        [thread2]: "2026-02-25T12:36:00.000Z",
      },
      threadCompletionOverrideById: {
        [thread1]: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: "2026-02-25T12:35:00.000Z",
        },
        [thread2]: {
          turnId: TurnId.makeUnsafe("turn-2"),
          completedAt: "2026-02-25T12:36:00.000Z",
        },
      },
    });

    const next = syncThreads(initialState, [
      {
        id: thread1,
        latestTurn: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: "2026-02-25T12:35:00.000Z",
        },
      },
    ]);

    expect(next.pinnedThreadIds).toEqual([thread1]);
    expect(next.threadLastVisitedAtById).toEqual({
      [thread1]: "2026-02-25T12:35:00.000Z",
    });
    expect(next.threadCompletionOverrideById).toEqual({
      [thread1]: {
        turnId: TurnId.makeUnsafe("turn-1"),
        completedAt: "2026-02-25T12:35:00.000Z",
      },
    });
  });

  it("syncThreads seeds visit state for unseen snapshot threads", () => {
    const thread1 = ThreadId.makeUnsafe("thread-1");
    const initialState = makeUiState();

    const next = syncThreads(initialState, [
      {
        id: thread1,
        seedVisitedAt: "2026-02-25T12:35:00.000Z",
      },
    ]);

    expect(next.threadLastVisitedAtById).toEqual({
      [thread1]: "2026-02-25T12:35:00.000Z",
    });
  });

  it("setProjectExpanded updates expansion without touching order", () => {
    const project1 = ProjectId.makeUnsafe("project-1");
    const initialState = makeUiState({
      projectExpandedById: {
        [project1]: true,
      },
      projectOrder: [project1],
    });

    const next = setProjectExpanded(initialState, project1, false);

    expect(next.projectExpandedById[project1]).toBe(false);
    expect(next.projectOrder).toEqual([project1]);
  });

  it("clearThreadCompletionOverride removes a manual completion override", () => {
    const thread1 = ThreadId.makeUnsafe("thread-1");
    const initialState = makeUiState({
      threadCompletionOverrideById: {
        [thread1]: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: "2026-02-25T12:35:00.000Z",
        },
      },
    });

    const next = clearThreadCompletionOverride(initialState, thread1);

    expect(next.threadCompletionOverrideById).toEqual({});
  });

  it("togglePinnedThread adds newly pinned threads to the front and unpins existing ones", () => {
    const thread1 = ThreadId.makeUnsafe("thread-1");
    const thread2 = ThreadId.makeUnsafe("thread-2");
    const initialState = makeUiState({
      pinnedThreadIds: [thread1],
    });

    const afterPin = togglePinnedThread(initialState, thread2);
    const afterUnpin = togglePinnedThread(afterPin, thread1);

    expect(afterPin.pinnedThreadIds).toEqual([thread2, thread1]);
    expect(afterUnpin.pinnedThreadIds).toEqual([thread2]);
  });

  it("stores project tasks by recreated project cwd during syncProjects", () => {
    const oldProjectId = ProjectId.makeUnsafe("project-old");
    const newProjectId = ProjectId.makeUnsafe("project-new");
    const stateWithProject = syncProjects(makeUiState(), [{ id: oldProjectId, cwd: "/tmp/app" }]);
    const stateWithTask = addProjectTask(stateWithProject, oldProjectId, "ship feature");

    const next = syncProjects(stateWithTask, [{ id: newProjectId, cwd: "/tmp/app" }]);

    expect(next.projectTasksById[newProjectId]).toHaveLength(1);
    expect(next.projectTasksById[newProjectId]?.[0]?.text).toBe("ship feature");
  });

  it("toggles and removes project tasks", () => {
    const projectId = ProjectId.makeUnsafe("project-1");
    const stateWithTask = addProjectTask(makeUiState(), projectId, "write docs");
    const taskId = stateWithTask.projectTasksById[projectId]?.[0]?.id;

    expect(taskId).toBeTruthy();

    const toggled = toggleProjectTask(stateWithTask, projectId, taskId ?? "");
    expect(toggled.projectTasksById[projectId]?.[0]?.completed).toBe(true);
    expect(toggled.projectTasksById[projectId]?.[0]?.completedAt).toBeTruthy();

    const removed = removeProjectTask(toggled, projectId, taskId ?? "");
    expect(removed.projectTasksById[projectId]).toEqual([]);
  });

  it("clearThreadUi removes visit state for deleted threads", () => {
    const thread1 = ThreadId.makeUnsafe("thread-1");
    const initialState = makeUiState({
      pinnedThreadIds: [thread1],
      threadLastVisitedAtById: {
        [thread1]: "2026-02-25T12:35:00.000Z",
      },
      threadCompletionOverrideById: {
        [thread1]: {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: "2026-02-25T12:35:00.000Z",
        },
      },
    });

    const next = clearThreadUi(initialState, thread1);

    expect(next.pinnedThreadIds).toEqual([]);
    expect(next.threadLastVisitedAtById).toEqual({});
    expect(next.threadCompletionOverrideById).toEqual({});
  });
});
