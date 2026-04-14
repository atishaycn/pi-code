import { describe, expect, it } from "vitest";

import { mergeStreamingMessageUpdate } from "./streamingMessage";

describe("mergeStreamingMessageUpdate", () => {
  it("appends streaming deltas while a message is still live", () => {
    expect(
      mergeStreamingMessageUpdate(
        {
          text: "Hello",
          streaming: true,
          createdAt: "2026-04-13T10:00:00.000Z",
          updatedAt: "2026-04-13T10:00:00.000Z",
          turnId: "turn-1",
        },
        {
          text: " world",
          streaming: true,
          createdAt: "2026-04-13T10:00:01.000Z",
          updatedAt: "2026-04-13T10:00:01.000Z",
          turnId: "turn-1",
        },
      ),
    ).toMatchObject({
      text: "Hello world",
      streaming: true,
      updatedAt: "2026-04-13T10:00:01.000Z",
      preventedReopen: false,
    });
  });

  it("keeps completed messages completed when a late streaming delta arrives", () => {
    expect(
      mergeStreamingMessageUpdate(
        {
          text: "Hello",
          streaming: false,
          createdAt: "2026-04-13T10:00:00.000Z",
          updatedAt: "2026-04-13T10:00:02.000Z",
          turnId: "turn-1",
        },
        {
          text: " world",
          streaming: true,
          createdAt: "2026-04-13T10:00:03.000Z",
          updatedAt: "2026-04-13T10:00:03.000Z",
          turnId: "turn-1",
        },
      ),
    ).toMatchObject({
      text: "Hello world",
      streaming: false,
      updatedAt: "2026-04-13T10:00:02.000Z",
      preventedReopen: true,
    });
  });

  it("preserves completed text when the completion payload is empty", () => {
    expect(
      mergeStreamingMessageUpdate(
        {
          text: "Hello world",
          streaming: true,
          createdAt: "2026-04-13T10:00:00.000Z",
          updatedAt: "2026-04-13T10:00:01.000Z",
          turnId: "turn-1",
        },
        {
          text: "",
          streaming: false,
          createdAt: "2026-04-13T10:00:02.000Z",
          updatedAt: "2026-04-13T10:00:02.000Z",
          turnId: "turn-1",
        },
      ),
    ).toMatchObject({
      text: "Hello world",
      streaming: false,
      updatedAt: "2026-04-13T10:00:02.000Z",
      preventedReopen: false,
    });
  });

  it("appends a late tail onto a live message when the completion payload only carries the tail", () => {
    expect(
      mergeStreamingMessageUpdate(
        {
          text: "Hello",
          streaming: true,
          createdAt: "2026-04-13T10:00:00.000Z",
          updatedAt: "2026-04-13T10:00:01.000Z",
          turnId: "turn-1",
        },
        {
          text: " world",
          streaming: false,
          createdAt: "2026-04-13T10:00:02.000Z",
          updatedAt: "2026-04-13T10:00:02.000Z",
          turnId: "turn-1",
        },
      ),
    ).toMatchObject({
      text: "Hello world",
      streaming: false,
      updatedAt: "2026-04-13T10:00:02.000Z",
      preventedReopen: false,
    });
  });
});
