import { describe, expect, it } from "vitest";

import {
  PI_TURN_COMPLETION_QUIET_PERIOD_MS,
  isPiTurnCompletionTerminalEvent,
  shouldPiTurnCompletionStayOpen,
} from "./piTurnCompletion";

describe("piTurnCompletion", () => {
  it("treats turn and agent end events as terminal completion signals", () => {
    expect(isPiTurnCompletionTerminalEvent({ type: "turn_end" })).toBe(true);
    expect(isPiTurnCompletionTerminalEvent({ type: "agent_end" })).toBe(true);
    expect(
      isPiTurnCompletionTerminalEvent({ type: "queue_update", steering: [], followUp: [] }),
    ).toBe(false);
  });

  it("keeps pending completion open when late work arrives", () => {
    expect(
      shouldPiTurnCompletionStayOpen({
        type: "tool_execution_start",
        toolCallId: "tool-1",
        toolName: "bash",
      }),
    ).toBe(true);
    expect(
      shouldPiTurnCompletionStayOpen({
        type: "message_update",
        message: {
          role: "assistant",
          content: [],
          provider: "openai",
          model: "gpt-5",
          stopReason: "tool_use",
          timestamp: 1,
        },
      }),
    ).toBe(true);
  });

  it("ignores queue updates for completion extension", () => {
    expect(
      shouldPiTurnCompletionStayOpen({
        type: "queue_update",
        steering: ["next"],
        followUp: [],
      }),
    ).toBe(false);
  });

  it("uses a short quiet period before final completion", () => {
    expect(PI_TURN_COMPLETION_QUIET_PERIOD_MS).toBe(2_000);
  });
});
