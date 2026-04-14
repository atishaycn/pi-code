import { ThreadId } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  selectQueuedFollowUps,
  useQueuedFollowUpStore,
  type QueuedFollowUpDraft,
} from "./queuedFollowUpStore";

const THREAD_ID = ThreadId.makeUnsafe("thread-queued");

function draft(id: string): QueuedFollowUpDraft {
  return {
    id,
    prompt: `prompt:${id}`,
    images: [],
    terminalContexts: [],
    createdAt: "2026-04-13T00:00:00.000Z",
    modelSelection: {
      provider: "codex",
      model: "gpt-5",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
  };
}

afterEach(() => {
  useQueuedFollowUpStore.setState({ queuedByThreadId: {} });
});

describe("queuedFollowUpStore", () => {
  it("keeps queued follow-ups keyed by thread until they are explicitly removed", () => {
    const store = useQueuedFollowUpStore.getState();

    store.enqueue(THREAD_ID, draft("queued-1"));
    store.enqueue(THREAD_ID, draft("queued-2"));

    expect(
      useQueuedFollowUpStore.getState().queuedByThreadId[THREAD_ID]?.map((entry) => entry.id),
    ).toEqual(["queued-1", "queued-2"]);

    store.remove(THREAD_ID, "queued-1");

    expect(
      useQueuedFollowUpStore.getState().queuedByThreadId[THREAD_ID]?.map((entry) => entry.id),
    ).toEqual(["queued-2"]);
  });

  it("drops the thread bucket when the last queued follow-up is shifted", () => {
    const store = useQueuedFollowUpStore.getState();

    store.enqueue(THREAD_ID, draft("queued-1"));

    expect(store.shift(THREAD_ID)?.id).toBe("queued-1");
    expect(useQueuedFollowUpStore.getState().queuedByThreadId[THREAD_ID]).toBeUndefined();
  });

  it("returns a stable empty queue reference for missing threads", () => {
    const state = useQueuedFollowUpStore.getState();

    expect(selectQueuedFollowUps(state, THREAD_ID)).toBe(selectQueuedFollowUps(state, THREAD_ID));
  });
});
