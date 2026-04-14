import { MessageId, ProjectId, ThreadId, TurnId } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";

import {
  MAX_HIDDEN_MOUNTED_TERMINAL_THREADS,
  buildExpiredTerminalContextToastCopy,
  buildForkChatPrompt,
  buildForkChatThreadTitle,
  createLocalDispatchSnapshot,
  deriveComposerDispatchStatusCopy,
  deriveComposerSendState,
  hasServerAcknowledgedLocalDispatch,
  reconcileMountedTerminalThreadIds,
  replaceQueuedEntryWithDraft,
  waitForStartedServerThread,
} from "./ChatView.logic";
import { deriveIsRunningTurn } from "../session-logic";

describe("deriveComposerSendState", () => {
  it("treats expired terminal pills as non-sendable content", () => {
    const state = deriveComposerSendState({
      prompt: "\uFFFC",
      imageCount: 0,
      terminalContexts: [
        {
          id: "ctx-expired",
          threadId: ThreadId.makeUnsafe("thread-1"),
          terminalId: "default",
          terminalLabel: "Terminal 1",
          lineStart: 4,
          lineEnd: 4,
          text: "",
          createdAt: "2026-03-17T12:52:29.000Z",
        },
      ],
    });

    expect(state.trimmedPrompt).toBe("");
    expect(state.sendableTerminalContexts).toEqual([]);
    expect(state.expiredTerminalContextCount).toBe(1);
    expect(state.hasSendableContent).toBe(false);
  });

  it("keeps text sendable while excluding expired terminal pills", () => {
    const state = deriveComposerSendState({
      prompt: `yoo \uFFFC waddup`,
      imageCount: 0,
      terminalContexts: [
        {
          id: "ctx-expired",
          threadId: ThreadId.makeUnsafe("thread-1"),
          terminalId: "default",
          terminalLabel: "Terminal 1",
          lineStart: 4,
          lineEnd: 4,
          text: "",
          createdAt: "2026-03-17T12:52:29.000Z",
        },
      ],
    });

    expect(state.trimmedPrompt).toBe("yoo  waddup");
    expect(state.expiredTerminalContextCount).toBe(1);
    expect(state.hasSendableContent).toBe(true);
  });
});

describe("replaceQueuedEntryWithDraft", () => {
  it("removes the edited queued message when nothing in the composer needs preserving", () => {
    expect(
      replaceQueuedEntryWithDraft({
        queue: [{ id: "queued-1" }, { id: "queued-2" }],
        draftId: "queued-1",
        replacement: null,
      }),
    ).toEqual([{ id: "queued-2" }]);
  });

  it("swaps the current composer draft into the edited queue slot", () => {
    expect(
      replaceQueuedEntryWithDraft({
        queue: [{ id: "queued-1" }, { id: "queued-2" }, { id: "queued-3" }],
        draftId: "queued-2",
        replacement: { id: "composer-draft" },
      }),
    ).toEqual([{ id: "queued-1" }, { id: "composer-draft" }, { id: "queued-3" }]);
  });
});

describe("buildExpiredTerminalContextToastCopy", () => {
  it("formats clear empty-state guidance", () => {
    expect(buildExpiredTerminalContextToastCopy(1, "empty")).toEqual({
      title: "Expired terminal context won't be sent",
      description: "Remove it or re-add it to include terminal output.",
    });
  });

  it("formats omission guidance for sent messages", () => {
    expect(buildExpiredTerminalContextToastCopy(2, "omitted")).toEqual({
      title: "Expired terminal contexts omitted from message",
      description: "Re-add it if you want that terminal output included.",
    });
  });
});

describe("buildForkChatThreadTitle", () => {
  it("adds a fork suffix once", () => {
    expect(buildForkChatThreadTitle("Debug sidebar layout")).toBe("Debug sidebar layout (fork)");
    expect(buildForkChatThreadTitle("Debug sidebar layout (fork)")).toBe(
      "Debug sidebar layout (fork)",
    );
  });
});

describe("buildForkChatPrompt", () => {
  it("includes metadata, plans, and a compact transcript handoff", () => {
    const prompt = buildForkChatPrompt({
      title: "Debug sidebar layout",
      modelSelection: {
        provider: "codex",
        model: "gpt-5",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: "feature/sidebar",
      worktreePath: "/tmp/sidebar-worktree",
      latestTurn: {
        turnId: TurnId.makeUnsafe("turn-2"),
        state: "completed",
        requestedAt: "2026-04-13T10:00:00.000Z",
        startedAt: "2026-04-13T10:00:01.000Z",
        completedAt: "2026-04-13T10:01:00.000Z",
        assistantMessageId: MessageId.makeUnsafe("assistant-2"),
      },
      proposedPlans: [
        {
          id: "plan-1",
          turnId: TurnId.makeUnsafe("turn-2"),
          planMarkdown: "# Fix sidebar\n\n- tighten spacing\n- add a hover state",
          implementedAt: null,
          implementationThreadId: null,
          createdAt: "2026-04-13T10:00:30.000Z",
          updatedAt: "2026-04-13T10:00:30.000Z",
        },
      ],
      messages: [
        {
          id: MessageId.makeUnsafe("msg-1"),
          role: "user",
          text: "Can you debug the sidebar layout drift?",
          createdAt: "2026-04-13T09:58:00.000Z",
          streaming: false,
        },
        {
          id: MessageId.makeUnsafe("msg-2"),
          role: "assistant",
          text: "Yes — I found a flex regression in the header row.",
          createdAt: "2026-04-13T09:59:00.000Z",
          streaming: false,
        },
      ],
    });

    expect(prompt).toContain("This thread is a fork of an earlier chat.");
    expect(prompt).toContain("## Original thread metadata");
    expect(prompt).toContain("- Model: codex/gpt-5");
    expect(prompt).toContain("- Branch: feature/sidebar");
    expect(prompt).toContain("## Latest proposed plan");
    expect(prompt).toContain("# Fix sidebar");
    expect(prompt).toContain("1. USER: Can you debug the sidebar layout drift?");
    expect(prompt).toContain("2. ASSISTANT: Yes — I found a flex regression in the header row.");
    expect(prompt).toContain("Do not start new work yet.");
  });

  it("omits middle transcript messages when the thread is long", () => {
    const prompt = buildForkChatPrompt({
      title: "Long thread",
      modelSelection: {
        provider: "codex",
        model: "gpt-5",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      latestTurn: null,
      proposedPlans: [],
      messages: Array.from({ length: 16 }, (_, index) => ({
        id: MessageId.makeUnsafe(`msg-${index + 1}`),
        role: index % 2 === 0 ? "user" : "assistant",
        text: `message ${index + 1}`,
        createdAt: `2026-04-13T10:${String(index).padStart(2, "0")}:00.000Z`,
        streaming: false,
      })),
    });

    expect(prompt).toContain("omitted 6 middle messages");
    expect(prompt).toContain("1. USER: message 1");
    expect(prompt).toContain("10. ASSISTANT: message 16");
  });
});

describe("reconcileMountedTerminalThreadIds", () => {
  it("keeps previously mounted open threads and adds the active open thread", () => {
    expect(
      reconcileMountedTerminalThreadIds({
        currentThreadIds: [
          ThreadId.makeUnsafe("thread-hidden"),
          ThreadId.makeUnsafe("thread-stale"),
        ],
        openThreadIds: [ThreadId.makeUnsafe("thread-hidden"), ThreadId.makeUnsafe("thread-active")],
        activeThreadId: ThreadId.makeUnsafe("thread-active"),
        activeThreadTerminalOpen: true,
      }),
    ).toEqual([ThreadId.makeUnsafe("thread-hidden"), ThreadId.makeUnsafe("thread-active")]);
  });

  it("drops mounted threads once their terminal drawer is no longer open", () => {
    expect(
      reconcileMountedTerminalThreadIds({
        currentThreadIds: [ThreadId.makeUnsafe("thread-closed")],
        openThreadIds: [],
        activeThreadId: ThreadId.makeUnsafe("thread-closed"),
        activeThreadTerminalOpen: false,
      }),
    ).toEqual([]);
  });

  it("keeps only the most recently active hidden terminal threads", () => {
    expect(
      reconcileMountedTerminalThreadIds({
        currentThreadIds: [
          ThreadId.makeUnsafe("thread-1"),
          ThreadId.makeUnsafe("thread-2"),
          ThreadId.makeUnsafe("thread-3"),
        ],
        openThreadIds: [
          ThreadId.makeUnsafe("thread-1"),
          ThreadId.makeUnsafe("thread-2"),
          ThreadId.makeUnsafe("thread-3"),
          ThreadId.makeUnsafe("thread-4"),
        ],
        activeThreadId: ThreadId.makeUnsafe("thread-4"),
        activeThreadTerminalOpen: true,
        maxHiddenThreadCount: 2,
      }),
    ).toEqual([
      ThreadId.makeUnsafe("thread-2"),
      ThreadId.makeUnsafe("thread-3"),
      ThreadId.makeUnsafe("thread-4"),
    ]);
  });

  it("moves the active thread to the end so it is treated as most recently used", () => {
    expect(
      reconcileMountedTerminalThreadIds({
        currentThreadIds: [
          ThreadId.makeUnsafe("thread-a"),
          ThreadId.makeUnsafe("thread-b"),
          ThreadId.makeUnsafe("thread-c"),
        ],
        openThreadIds: [
          ThreadId.makeUnsafe("thread-a"),
          ThreadId.makeUnsafe("thread-b"),
          ThreadId.makeUnsafe("thread-c"),
        ],
        activeThreadId: ThreadId.makeUnsafe("thread-a"),
        activeThreadTerminalOpen: true,
        maxHiddenThreadCount: 2,
      }),
    ).toEqual([
      ThreadId.makeUnsafe("thread-b"),
      ThreadId.makeUnsafe("thread-c"),
      ThreadId.makeUnsafe("thread-a"),
    ]);
  });

  it("defaults to the hidden mounted terminal cap", () => {
    const currentThreadIds = Array.from(
      { length: MAX_HIDDEN_MOUNTED_TERMINAL_THREADS + 2 },
      (_, index) => ThreadId.makeUnsafe(`thread-${index + 1}`),
    );

    expect(
      reconcileMountedTerminalThreadIds({
        currentThreadIds,
        openThreadIds: currentThreadIds,
        activeThreadId: null,
        activeThreadTerminalOpen: false,
      }),
    ).toEqual(currentThreadIds.slice(-MAX_HIDDEN_MOUNTED_TERMINAL_THREADS));
  });
});

const makeThread = (input?: {
  id?: ThreadId;
  latestTurn?: {
    turnId: TurnId;
    state: "running" | "completed";
    requestedAt: string;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
}) => ({
  id: input?.id ?? ThreadId.makeUnsafe("thread-1"),
  codexThreadId: null,
  projectId: ProjectId.makeUnsafe("project-1"),
  title: "Thread",
  modelSelection: { provider: "codex" as const, model: "gpt-5.4" },
  runtimeMode: "full-access" as const,
  interactionMode: "default" as const,
  session: null,
  messages: [],
  proposedPlans: [],
  error: null,
  createdAt: "2026-03-29T00:00:00.000Z",
  archivedAt: null,
  updatedAt: "2026-03-29T00:00:00.000Z",
  latestTurn: input?.latestTurn
    ? {
        ...input.latestTurn,
        assistantMessageId: null,
      }
    : null,
  branch: null,
  worktreePath: null,
  turnDiffSummaries: [],
  activities: [],
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  useStore.setState((state) => ({
    ...state,
    projects: [],
    threads: [],
    bootstrapComplete: true,
  }));
});

describe("waitForStartedServerThread", () => {
  it("resolves immediately when the thread is already started", async () => {
    const threadId = ThreadId.makeUnsafe("thread-started");
    useStore.setState((state) => ({
      ...state,
      threads: [
        makeThread({
          id: threadId,
          latestTurn: {
            turnId: TurnId.makeUnsafe("turn-started"),
            state: "running",
            requestedAt: "2026-03-29T00:00:01.000Z",
            startedAt: "2026-03-29T00:00:01.000Z",
            completedAt: null,
          },
        }),
      ],
    }));

    await expect(waitForStartedServerThread(threadId)).resolves.toBe(true);
  });

  it("waits for the thread to start via subscription updates", async () => {
    const threadId = ThreadId.makeUnsafe("thread-wait");
    useStore.setState((state) => ({
      ...state,
      threads: [makeThread({ id: threadId })],
    }));

    const promise = waitForStartedServerThread(threadId, 500);

    useStore.setState((state) => ({
      ...state,
      threads: [
        makeThread({
          id: threadId,
          latestTurn: {
            turnId: TurnId.makeUnsafe("turn-started"),
            state: "running",
            requestedAt: "2026-03-29T00:00:01.000Z",
            startedAt: "2026-03-29T00:00:01.000Z",
            completedAt: null,
          },
        }),
      ],
    }));

    await expect(promise).resolves.toBe(true);
  });

  it("handles the thread starting between the initial read and subscription setup", async () => {
    const threadId = ThreadId.makeUnsafe("thread-race");
    useStore.setState((state) => ({
      ...state,
      threads: [makeThread({ id: threadId })],
    }));

    const originalSubscribe = useStore.subscribe.bind(useStore);
    let raced = false;
    vi.spyOn(useStore, "subscribe").mockImplementation((listener) => {
      if (!raced) {
        raced = true;
        useStore.setState((state) => ({
          ...state,
          threads: [
            makeThread({
              id: threadId,
              latestTurn: {
                turnId: TurnId.makeUnsafe("turn-race"),
                state: "running",
                requestedAt: "2026-03-29T00:00:01.000Z",
                startedAt: "2026-03-29T00:00:01.000Z",
                completedAt: null,
              },
            }),
          ],
        }));
      }
      return originalSubscribe(listener);
    });

    await expect(waitForStartedServerThread(threadId, 500)).resolves.toBe(true);
  });

  it("returns false after the timeout when the thread never starts", async () => {
    vi.useFakeTimers();

    const threadId = ThreadId.makeUnsafe("thread-timeout");
    useStore.setState((state) => ({
      ...state,
      threads: [makeThread({ id: threadId })],
    }));
    const promise = waitForStartedServerThread(threadId, 500);

    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toBe(false);
  });
});

describe("deriveIsRunningTurn", () => {
  it("keeps the working state while the assistant message is still streaming", () => {
    expect(
      deriveIsRunningTurn({
        activeLatestTurn: {
          turnId: TurnId.makeUnsafe("turn-1"),
          assistantMessageId: MessageId.makeUnsafe("assistant-1"),
          completedAt: "2026-03-29T00:00:10.000Z",
        },
        latestTurnSettled: true,
        sessionOrchestrationStatus: "ready",
        sessionActiveTurnId: undefined,
        hasStreamingAssistantMessage: true,
        hasAssistantReplyForActiveTurn: true,
        hasWorkLogEntry: true,
      }),
    ).toBe(true);
  });

  it("keeps the working state briefly while waiting for the final assistant reply after turn settlement", () => {
    expect(
      deriveIsRunningTurn({
        activeLatestTurn: {
          turnId: TurnId.makeUnsafe("turn-1"),
          assistantMessageId: MessageId.makeUnsafe("assistant-1"),
          completedAt: "2026-03-29T00:00:10.000Z",
        },
        latestTurnSettled: true,
        sessionOrchestrationStatus: "ready",
        sessionActiveTurnId: undefined,
        hasStreamingAssistantMessage: false,
        hasAssistantReplyForActiveTurn: false,
        hasWorkLogEntry: false,
        nowIso: "2026-03-29T00:00:12.000Z",
      }),
    ).toBe(true);
  });

  it("stops the working state after the final assistant reply grace window expires", () => {
    expect(
      deriveIsRunningTurn({
        activeLatestTurn: {
          turnId: TurnId.makeUnsafe("turn-1"),
          assistantMessageId: MessageId.makeUnsafe("assistant-1"),
          completedAt: "2026-03-29T00:00:10.000Z",
        },
        latestTurnSettled: true,
        sessionOrchestrationStatus: "ready",
        sessionActiveTurnId: undefined,
        hasStreamingAssistantMessage: false,
        hasAssistantReplyForActiveTurn: false,
        hasWorkLogEntry: true,
        nowIso: "2026-03-29T00:00:16.000Z",
      }),
    ).toBe(false);
  });

  it("can skip the post-completion waiting state for sidebar thread summaries", () => {
    expect(
      deriveIsRunningTurn({
        activeLatestTurn: {
          turnId: TurnId.makeUnsafe("turn-1"),
          assistantMessageId: MessageId.makeUnsafe("assistant-1"),
          completedAt: "2026-03-29T00:00:10.000Z",
        },
        latestTurnSettled: true,
        sessionOrchestrationStatus: "ready",
        sessionActiveTurnId: undefined,
        hasStreamingAssistantMessage: false,
        hasAssistantReplyForActiveTurn: false,
        hasWorkLogEntry: true,
        allowPostCompletionReplyWait: false,
      }),
    ).toBe(false);
  });

  it("can skip stale running-session fallback once the turn already completed", () => {
    expect(
      deriveIsRunningTurn({
        activeLatestTurn: {
          turnId: TurnId.makeUnsafe("turn-1"),
          assistantMessageId: MessageId.makeUnsafe("assistant-1"),
          completedAt: "2026-03-29T00:00:10.000Z",
        },
        latestTurnSettled: false,
        sessionOrchestrationStatus: "running",
        sessionActiveTurnId: TurnId.makeUnsafe("turn-1"),
        hasStreamingAssistantMessage: false,
        hasAssistantReplyForActiveTurn: false,
        hasWorkLogEntry: true,
        allowPostCompletionReplyWait: false,
      }),
    ).toBe(false);
  });

  it("stops the working state once streaming is done and the assistant reply is visible", () => {
    expect(
      deriveIsRunningTurn({
        activeLatestTurn: {
          turnId: TurnId.makeUnsafe("turn-1"),
          assistantMessageId: MessageId.makeUnsafe("assistant-1"),
          completedAt: "2026-03-29T00:00:10.000Z",
        },
        latestTurnSettled: true,
        sessionOrchestrationStatus: "ready",
        sessionActiveTurnId: undefined,
        hasStreamingAssistantMessage: false,
        hasAssistantReplyForActiveTurn: true,
        hasWorkLogEntry: false,
      }),
    ).toBe(false);
  });

  it("ignores stale running-session state once the final assistant reply is already visible", () => {
    expect(
      deriveIsRunningTurn({
        activeLatestTurn: {
          turnId: TurnId.makeUnsafe("turn-stale"),
          assistantMessageId: "assistant-1" as never,
          completedAt: "2026-03-29T00:00:10.000Z",
        },
        latestTurnSettled: false,
        sessionOrchestrationStatus: "running",
        sessionActiveTurnId: TurnId.makeUnsafe("turn-stale"),
        hasStreamingAssistantMessage: false,
        hasAssistantReplyForActiveTurn: true,
        hasWorkLogEntry: true,
      }),
    ).toBe(false);
  });

  it("ignores stale running-session state once a completed turn already has a visible assistant reply", () => {
    expect(
      deriveIsRunningTurn({
        activeLatestTurn: {
          turnId: TurnId.makeUnsafe("turn-stale-completed"),
          assistantMessageId: "assistant-2" as never,
          completedAt: "2026-03-29T00:00:10.000Z",
        },
        latestTurnSettled: false,
        sessionOrchestrationStatus: "running",
        sessionActiveTurnId: TurnId.makeUnsafe("turn-stale-completed"),
        hasStreamingAssistantMessage: true,
        hasAssistantReplyForActiveTurn: true,
        hasWorkLogEntry: true,
      }),
    ).toBe(false);
  });

  it("ignores stale running-session state for completed turns that never produced an assistant reply", () => {
    expect(
      deriveIsRunningTurn({
        activeLatestTurn: {
          turnId: TurnId.makeUnsafe("turn-tool-only"),
          assistantMessageId: null,
          completedAt: "2026-03-29T00:00:10.000Z",
        },
        latestTurnSettled: false,
        sessionOrchestrationStatus: "running",
        sessionActiveTurnId: TurnId.makeUnsafe("turn-tool-only"),
        hasStreamingAssistantMessage: false,
        hasAssistantReplyForActiveTurn: false,
        hasWorkLogEntry: true,
      }),
    ).toBe(false);
  });
});

describe("hasServerAcknowledgedLocalDispatch", () => {
  const projectId = ProjectId.makeUnsafe("project-1");
  const previousLatestTurn = {
    turnId: TurnId.makeUnsafe("turn-1"),
    state: "completed" as const,
    requestedAt: "2026-03-29T00:00:00.000Z",
    startedAt: "2026-03-29T00:00:01.000Z",
    completedAt: "2026-03-29T00:00:10.000Z",
    assistantMessageId: null,
  };

  const previousSession = {
    provider: "codex" as const,
    status: "ready" as const,
    createdAt: "2026-03-29T00:00:00.000Z",
    updatedAt: "2026-03-29T00:00:10.000Z",
    orchestrationStatus: "idle" as const,
  };

  it("does not clear local dispatch before server state changes", () => {
    const localDispatch = createLocalDispatchSnapshot({
      id: ThreadId.makeUnsafe("thread-1"),
      codexThreadId: null,
      projectId,
      title: "Thread",
      modelSelection: { provider: "codex", model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      session: previousSession,
      messages: [],
      proposedPlans: [],
      error: null,
      createdAt: "2026-03-29T00:00:00.000Z",
      archivedAt: null,
      updatedAt: "2026-03-29T00:00:10.000Z",
      latestTurn: previousLatestTurn,
      branch: null,
      worktreePath: null,
      turnDiffSummaries: [],
      activities: [],
    });

    expect(
      hasServerAcknowledgedLocalDispatch({
        localDispatch,
        phase: "ready",
        latestTurn: previousLatestTurn,
        session: previousSession,
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
      }),
    ).toBe(false);
  });

  it("clears local dispatch when a new turn is already settled", () => {
    const localDispatch = createLocalDispatchSnapshot({
      id: ThreadId.makeUnsafe("thread-1"),
      codexThreadId: null,
      projectId,
      title: "Thread",
      modelSelection: { provider: "codex", model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      session: previousSession,
      messages: [],
      proposedPlans: [],
      error: null,
      createdAt: "2026-03-29T00:00:00.000Z",
      archivedAt: null,
      updatedAt: "2026-03-29T00:00:10.000Z",
      latestTurn: previousLatestTurn,
      branch: null,
      worktreePath: null,
      turnDiffSummaries: [],
      activities: [],
    });

    expect(
      hasServerAcknowledgedLocalDispatch({
        localDispatch,
        phase: "ready",
        latestTurn: {
          ...previousLatestTurn,
          turnId: TurnId.makeUnsafe("turn-2"),
          requestedAt: "2026-03-29T00:01:00.000Z",
          startedAt: "2026-03-29T00:01:01.000Z",
          completedAt: "2026-03-29T00:01:30.000Z",
        },
        session: {
          ...previousSession,
          updatedAt: "2026-03-29T00:01:30.000Z",
        },
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
      }),
    ).toBe(true);
  });

  it("clears local dispatch when the session changes without an observed running phase", () => {
    const localDispatch = createLocalDispatchSnapshot({
      id: ThreadId.makeUnsafe("thread-1"),
      codexThreadId: null,
      projectId,
      title: "Thread",
      modelSelection: { provider: "codex", model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      session: previousSession,
      messages: [],
      proposedPlans: [],
      error: null,
      createdAt: "2026-03-29T00:00:00.000Z",
      archivedAt: null,
      updatedAt: "2026-03-29T00:00:10.000Z",
      latestTurn: previousLatestTurn,
      branch: null,
      worktreePath: null,
      turnDiffSummaries: [],
      activities: [],
    });

    expect(
      hasServerAcknowledgedLocalDispatch({
        localDispatch,
        phase: "ready",
        latestTurn: previousLatestTurn,
        session: {
          ...previousSession,
          updatedAt: "2026-03-29T00:00:11.000Z",
        },
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
      }),
    ).toBe(true);
  });

  it("describes worktree preparation while the first turn is bootstrapping", () => {
    expect(
      deriveComposerDispatchStatusCopy({
        isConnecting: false,
        isPreparingWorktree: true,
        isSendBusy: true,
        isServerThread: false,
        localDispatchStartedAt: "2026-03-29T00:00:00.000Z",
        nowMs: Date.parse("2026-03-29T00:00:05.000Z"),
        session: null,
      }),
    ).toEqual({
      title: "Preparing worktree · 5s elapsed",
      description: "Creating an isolated workspace before the first turn starts.",
    });
  });

  it("describes provider session startup while waiting for a connection", () => {
    expect(
      deriveComposerDispatchStatusCopy({
        isConnecting: true,
        isPreparingWorktree: false,
        isSendBusy: false,
        isServerThread: true,
        localDispatchStartedAt: "2026-03-29T00:00:00.000Z",
        nowMs: Date.parse("2026-03-29T00:00:03.000Z"),
        session: {
          ...previousSession,
          status: "connecting",
        },
      }),
    ).toEqual({
      title: "Connecting to Pi · 3s elapsed",
      description: "Waiting for the provider session to become ready for this thread.",
    });
  });
});
