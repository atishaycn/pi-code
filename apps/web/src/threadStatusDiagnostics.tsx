import { type ThreadId } from "@t3tools/contracts";
import { useEffect } from "react";

import { readNativeApi } from "./nativeApi";
import { type AppState, useStore } from "./store";
import { type SidebarThreadSummary, type Thread } from "./types";
import {
  matchesThreadCompletionOverride,
  type ThreadCompletionOverride,
  type UiState,
  useUiStateStore,
} from "./uiStateStore";
import {
  hasUnseenCompletion,
  resolveThreadStatusDecision,
  type ThreadStatusDecisionReason,
} from "./components/Sidebar.logic";

interface DiagnosticMessageSummary {
  id: string;
  role: Thread["messages"][number]["role"];
  turnId: string | null;
  createdAt: string;
  completedAt: string | null;
  streaming: boolean;
  textPreview: string;
}

interface DiagnosticActivitySummary {
  id: string;
  kind: string;
  tone: string;
  summary: string;
  createdAt: string;
  turnId: string | null;
}

type ThreadStatusInput = Thread &
  Pick<
    SidebarThreadSummary,
    | "interactionMode"
    | "session"
    | "latestTurn"
    | "latestUserMessageAt"
    | "hasPendingApprovals"
    | "hasPendingUserInput"
    | "hasActionableProposedPlan"
    | "isRunningTurn"
  >;

export interface ThreadStatusDiagnosticSnapshot {
  threadId: ThreadId;
  title: string;
  statusLabel: ReturnType<typeof resolveThreadStatusDecision>["status"] extends infer TStatus
    ? TStatus extends { label: infer TLabel }
      ? TLabel | null
      : null
    : null;
  decisionReason: ThreadStatusDecisionReason;
  isManuallyCompleted: boolean;
  hasUnseenCompletion: boolean;
  lastVisitedAt: string | null;
  completionOverride: ThreadCompletionOverride | null;
  latestTurnSettled: boolean;
  summary: {
    interactionMode: Thread["interactionMode"];
    isRunningTurn: boolean;
    hasPendingApprovals: boolean;
    hasPendingUserInput: boolean;
    hasActionableProposedPlan: boolean;
    latestUserMessageAt: string | null;
    updatedAt: string | null;
    archivedAt: string | null;
  };
  latestTurn: {
    turnId: string | null;
    state: string | null;
    requestedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    assistantMessageId: string | null;
  };
  session: {
    status: string | null;
    orchestrationStatus: string | null;
    activeTurnId: string | null;
    updatedAt: string | null;
    lastError: string | null;
  };
  messages: {
    count: number;
    anchorMessage: DiagnosticMessageSummary | null;
    previousMessage: DiagnosticMessageSummary | null;
    nextMessage: DiagnosticMessageSummary | null;
    latestUserMessage: DiagnosticMessageSummary | null;
    latestAssistantMessageForLatestTurn: DiagnosticMessageSummary | null;
  };
  activities: {
    count: number;
    latest: DiagnosticActivitySummary[];
  };
}

interface ThreadStatusDiagnosticEntry {
  signature: string;
  snapshot: ThreadStatusDiagnosticSnapshot;
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function summarizeMessage(
  message: Thread["messages"][number] | null | undefined,
): DiagnosticMessageSummary | null {
  if (!message) {
    return null;
  }

  return {
    id: message.id,
    role: message.role,
    turnId: message.turnId ?? null,
    createdAt: message.createdAt,
    completedAt: message.completedAt ?? null,
    streaming: message.streaming,
    textPreview: truncateText(message.text.replace(/\s+/g, " ").trim(), 240),
  };
}

function summarizeActivity(activity: Thread["activities"][number]): DiagnosticActivitySummary {
  return {
    id: activity.id,
    kind: activity.kind,
    tone: activity.tone,
    summary: truncateText(activity.summary, 160),
    createdAt: activity.createdAt,
    turnId: activity.turnId ?? null,
  };
}

function buildMessageSnapshot(
  thread: ThreadStatusInput,
): ThreadStatusDiagnosticSnapshot["messages"] {
  const latestTurnId = thread.latestTurn?.turnId ?? null;
  const latestAssistantMessageForLatestTurn =
    thread.messages
      .toReversed()
      .find((message) => message.role === "assistant" && message.turnId === latestTurnId) ?? null;
  const latestUserMessage =
    thread.messages.toReversed().find((message) => message.role === "user") ?? null;
  const anchorMessage =
    (thread.latestTurn?.assistantMessageId
      ? thread.messages.find((message) => message.id === thread.latestTurn?.assistantMessageId)
      : null) ??
    latestAssistantMessageForLatestTurn ??
    thread.messages.at(-1) ??
    null;
  const anchorIndex = anchorMessage
    ? thread.messages.findIndex((message) => message.id === anchorMessage.id)
    : -1;

  return {
    count: thread.messages.length,
    anchorMessage: summarizeMessage(anchorMessage),
    previousMessage: anchorIndex > 0 ? summarizeMessage(thread.messages[anchorIndex - 1]) : null,
    nextMessage:
      anchorIndex >= 0 && anchorIndex < thread.messages.length - 1
        ? summarizeMessage(thread.messages[anchorIndex + 1])
        : null,
    latestUserMessage: summarizeMessage(latestUserMessage),
    latestAssistantMessageForLatestTurn: summarizeMessage(latestAssistantMessageForLatestTurn),
  };
}

function buildThreadStatusDiagnosticEntry(input: {
  thread: ThreadStatusInput;
  lastVisitedAt: string | undefined;
  completionOverride: ThreadCompletionOverride | undefined;
}): ThreadStatusDiagnosticEntry {
  const isManuallyCompleted = matchesThreadCompletionOverride({
    latestTurn: input.thread.latestTurn,
    override: input.completionOverride,
  });
  const decision = resolveThreadStatusDecision({
    thread: {
      ...input.thread,
      lastVisitedAt: input.lastVisitedAt,
      isManuallyCompleted,
    },
  });
  const snapshot: ThreadStatusDiagnosticSnapshot = {
    threadId: input.thread.id,
    title: input.thread.title,
    statusLabel: decision.status?.label ?? null,
    decisionReason: decision.reason,
    isManuallyCompleted,
    hasUnseenCompletion: hasUnseenCompletion({
      hasActionableProposedPlan: input.thread.hasActionableProposedPlan,
      hasPendingApprovals: input.thread.hasPendingApprovals,
      hasPendingUserInput: input.thread.hasPendingUserInput,
      interactionMode: input.thread.interactionMode,
      isRunningTurn: input.thread.isRunningTurn,
      latestTurn: input.thread.latestTurn,
      session: input.thread.session,
      lastVisitedAt: input.lastVisitedAt,
      isManuallyCompleted,
    }),
    lastVisitedAt: input.lastVisitedAt ?? null,
    completionOverride: input.completionOverride ?? null,
    latestTurnSettled:
      input.thread.latestTurn?.startedAt != null &&
      input.thread.latestTurn.completedAt != null &&
      !(
        input.thread.session?.orchestrationStatus === "running" &&
        input.thread.session.activeTurnId != null
      ),
    summary: {
      interactionMode: input.thread.interactionMode,
      isRunningTurn: input.thread.isRunningTurn,
      hasPendingApprovals: input.thread.hasPendingApprovals,
      hasPendingUserInput: input.thread.hasPendingUserInput,
      hasActionableProposedPlan: input.thread.hasActionableProposedPlan,
      latestUserMessageAt: input.thread.latestUserMessageAt,
      updatedAt: input.thread.updatedAt ?? null,
      archivedAt: input.thread.archivedAt,
    },
    latestTurn: {
      turnId: input.thread.latestTurn?.turnId ?? null,
      state: input.thread.latestTurn?.state ?? null,
      requestedAt: input.thread.latestTurn?.requestedAt ?? null,
      startedAt: input.thread.latestTurn?.startedAt ?? null,
      completedAt: input.thread.latestTurn?.completedAt ?? null,
      assistantMessageId: input.thread.latestTurn?.assistantMessageId ?? null,
    },
    session: {
      status: input.thread.session?.status ?? null,
      orchestrationStatus: input.thread.session?.orchestrationStatus ?? null,
      activeTurnId: input.thread.session?.activeTurnId ?? null,
      updatedAt: input.thread.session?.updatedAt ?? null,
      lastError: input.thread.session?.lastError ?? null,
    },
    messages: buildMessageSnapshot(input.thread),
    activities: {
      count: input.thread.activities.length,
      latest: input.thread.activities.slice(-5).map(summarizeActivity),
    },
  };

  return {
    signature: JSON.stringify(snapshot),
    snapshot,
  };
}

export function buildThreadStatusDiagnosticEntries(input: {
  appState: AppState;
  uiState: UiState;
}): Map<string, ThreadStatusDiagnosticEntry> {
  const entries = new Map<string, ThreadStatusDiagnosticEntry>();
  const threadsById = new Map(input.appState.threads.map((thread) => [thread.id, thread] as const));

  for (const [threadId, summary] of Object.entries(input.appState.sidebarThreadsById)) {
    const thread = threadsById.get(threadId as ThreadId);
    if (!thread || summary.archivedAt !== null) {
      continue;
    }

    entries.set(
      threadId,
      buildThreadStatusDiagnosticEntry({
        thread: {
          ...thread,
          interactionMode: summary.interactionMode,
          session: summary.session,
          latestTurn: summary.latestTurn,
          archivedAt: summary.archivedAt,
          updatedAt: summary.updatedAt,
          latestUserMessageAt: summary.latestUserMessageAt,
          hasPendingApprovals: summary.hasPendingApprovals,
          hasPendingUserInput: summary.hasPendingUserInput,
          hasActionableProposedPlan: summary.hasActionableProposedPlan,
          isRunningTurn: summary.isRunningTurn,
        },
        lastVisitedAt: input.uiState.threadLastVisitedAtById[thread.id],
        completionOverride: input.uiState.threadCompletionOverrideById[thread.id],
      }),
    );
  }

  return entries;
}

function buildChangeRecord(input: {
  previous: ThreadStatusDiagnosticSnapshot | null;
  next: ThreadStatusDiagnosticSnapshot;
}) {
  return {
    version: 1,
    kind: "thread-status-snapshot.changed",
    loggedAt: new Date().toISOString(),
    threadId: input.next.threadId,
    previousStatusLabel: input.previous?.statusLabel ?? null,
    nextStatusLabel: input.next.statusLabel,
    previousDecisionReason: input.previous?.decisionReason ?? null,
    nextDecisionReason: input.next.decisionReason,
    previousSnapshot: input.previous,
    nextSnapshot: input.next,
  };
}

function buildRemovedRecord(previous: ThreadStatusDiagnosticSnapshot) {
  return {
    version: 1,
    kind: "thread-status-snapshot.removed",
    loggedAt: new Date().toISOString(),
    threadId: previous.threadId,
    previousStatusLabel: previous.statusLabel,
    previousDecisionReason: previous.decisionReason,
    previousSnapshot: previous,
  };
}

export function ThreadStatusDiagnosticsCoordinator() {
  useEffect(() => {
    const api = readNativeApi();
    if (!api) {
      return;
    }

    let disposed = false;
    let evaluateScheduled = false;
    let flushScheduled = false;
    let flushing = false;
    const previousEntriesByThreadId = new Map<string, ThreadStatusDiagnosticEntry>();
    const pendingWrites: Array<{ threadId: ThreadId; recordJson: string }> = [];

    const flushWrites = async () => {
      flushScheduled = false;
      if (flushing || disposed) {
        return;
      }

      flushing = true;
      try {
        while (pendingWrites.length > 0) {
          if (disposed) {
            break;
          }
          const nextWrite = pendingWrites.shift();
          if (!nextWrite) {
            continue;
          }
          try {
            await api.server.appendThreadStatusLog(nextWrite);
          } catch (error) {
            console.warn("[thread-status-diagnostics] failed to append thread status log", {
              threadId: nextWrite.threadId,
              error,
            });
          }
        }
      } finally {
        flushing = false;
        if (!disposed && pendingWrites.length > 0 && !flushScheduled) {
          flushScheduled = true;
          queueMicrotask(() => {
            void flushWrites();
          });
        }
      }
    };

    const enqueueWrite = (threadId: ThreadId, record: unknown) => {
      pendingWrites.push({
        threadId,
        recordJson: JSON.stringify(record),
      });
      if (flushScheduled) {
        return;
      }
      flushScheduled = true;
      queueMicrotask(() => {
        void flushWrites();
      });
    };

    const evaluate = () => {
      evaluateScheduled = false;
      if (disposed) {
        return;
      }

      const nextEntriesByThreadId = buildThreadStatusDiagnosticEntries({
        appState: useStore.getState(),
        uiState: useUiStateStore.getState(),
      });

      for (const [threadId, nextEntry] of nextEntriesByThreadId) {
        const previousEntry = previousEntriesByThreadId.get(threadId);
        if (!previousEntry || previousEntry.signature !== nextEntry.signature) {
          enqueueWrite(
            nextEntry.snapshot.threadId,
            buildChangeRecord({
              previous: previousEntry?.snapshot ?? null,
              next: nextEntry.snapshot,
            }),
          );
        }
      }

      for (const [threadId, previousEntry] of previousEntriesByThreadId) {
        if (!nextEntriesByThreadId.has(threadId)) {
          enqueueWrite(previousEntry.snapshot.threadId, buildRemovedRecord(previousEntry.snapshot));
        }
      }

      previousEntriesByThreadId.clear();
      for (const [threadId, entry] of nextEntriesByThreadId) {
        previousEntriesByThreadId.set(threadId, entry);
      }
    };

    const scheduleEvaluate = () => {
      if (evaluateScheduled) {
        return;
      }
      evaluateScheduled = true;
      queueMicrotask(evaluate);
    };

    scheduleEvaluate();
    const unsubscribeAppState = useStore.subscribe(scheduleEvaluate);
    const unsubscribeUiState = useUiStateStore.subscribe(scheduleEvaluate);

    return () => {
      disposed = true;
      unsubscribeAppState();
      unsubscribeUiState();
    };
  }, []);

  return null;
}
