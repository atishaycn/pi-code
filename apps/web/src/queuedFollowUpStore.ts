import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import { create } from "zustand";

import type { ComposerImageAttachment } from "./composerDraftStore";
import type { TerminalContextDraft } from "./lib/terminalContext";

export interface QueuedFollowUpDraft {
  id: string;
  prompt: string;
  images: ComposerImageAttachment[];
  terminalContexts: TerminalContextDraft[];
  createdAt: string;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
}

interface QueuedFollowUpStoreState {
  queuedByThreadId: Partial<Record<ThreadId, QueuedFollowUpDraft[]>>;
  enqueue: (threadId: ThreadId, draft: QueuedFollowUpDraft) => void;
  remove: (threadId: ThreadId, draftId: string) => QueuedFollowUpDraft | null;
  shift: (threadId: ThreadId) => QueuedFollowUpDraft | null;
  replaceQueue: (threadId: ThreadId, queue: QueuedFollowUpDraft[]) => void;
}

const EMPTY_QUEUED_FOLLOW_UPS: QueuedFollowUpDraft[] = [];

export function selectQueuedFollowUps(
  state: Pick<QueuedFollowUpStoreState, "queuedByThreadId">,
  threadId: ThreadId,
): QueuedFollowUpDraft[] {
  return state.queuedByThreadId[threadId] ?? EMPTY_QUEUED_FOLLOW_UPS;
}

export const useQueuedFollowUpStore = create<QueuedFollowUpStoreState>((set, get) => ({
  queuedByThreadId: {},
  enqueue: (threadId, draft) =>
    set((state) => ({
      queuedByThreadId: {
        ...state.queuedByThreadId,
        [threadId]: [...(state.queuedByThreadId[threadId] ?? []), draft],
      },
    })),
  remove: (threadId, draftId) => {
    const existing = get().queuedByThreadId[threadId] ?? [];
    const draft = existing.find((entry) => entry.id === draftId) ?? null;
    if (!draft) {
      return null;
    }
    const next = existing.filter((entry) => entry.id !== draftId);
    set((state) => ({
      queuedByThreadId:
        next.length > 0
          ? { ...state.queuedByThreadId, [threadId]: next }
          : Object.fromEntries(
              Object.entries(state.queuedByThreadId).filter(([key]) => key !== threadId),
            ),
    }));
    return draft;
  },
  shift: (threadId) => {
    const existing = get().queuedByThreadId[threadId] ?? [];
    const [first, ...rest] = existing;
    if (!first) {
      return null;
    }
    set((state) => ({
      queuedByThreadId:
        rest.length > 0
          ? { ...state.queuedByThreadId, [threadId]: rest }
          : Object.fromEntries(
              Object.entries(state.queuedByThreadId).filter(([key]) => key !== threadId),
            ),
    }));
    return first;
  },
  replaceQueue: (threadId, queue) =>
    set((state) => ({
      queuedByThreadId:
        queue.length > 0
          ? { ...state.queuedByThreadId, [threadId]: [...queue] }
          : Object.fromEntries(
              Object.entries(state.queuedByThreadId).filter(([key]) => key !== threadId),
            ),
    })),
}));

export function useQueuedFollowUps(threadId: ThreadId): QueuedFollowUpDraft[] {
  return useQueuedFollowUpStore((state) => selectQueuedFollowUps(state, threadId));
}
