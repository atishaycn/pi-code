import { TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { deriveActiveWorkStartedAt, isLatestTurnSettled } from "./session-logic";

const latestTurn = {
  turnId: TurnId.makeUnsafe("turn-1"),
  startedAt: "2026-04-12T07:45:00.000Z",
  completedAt: "2026-04-12T07:45:05.000Z",
};

describe("isLatestTurnSettled", () => {
  it("treats completed turns as settled once orchestration has no active turn", () => {
    expect(
      isLatestTurnSettled(latestTurn, {
        orchestrationStatus: "running",
        activeTurnId: undefined,
      }),
    ).toBe(true);
  });

  it("treats null active-turn ids as no active turn", () => {
    expect(
      isLatestTurnSettled(latestTurn, {
        orchestrationStatus: "running",
        activeTurnId: null,
      }),
    ).toBe(true);
  });

  it("keeps completed turns unsettled while orchestration still reports an active turn", () => {
    expect(
      isLatestTurnSettled(latestTurn, {
        orchestrationStatus: "running",
        activeTurnId: TurnId.makeUnsafe("turn-1"),
      }),
    ).toBe(false);
  });
});

describe("deriveActiveWorkStartedAt", () => {
  it("drops stale running timers after completion when no active turn remains", () => {
    expect(
      deriveActiveWorkStartedAt(
        latestTurn,
        {
          orchestrationStatus: "running",
          activeTurnId: undefined,
        },
        null,
      ),
    ).toBeNull();
  });

  it("drops stale running timers when the server reports a null active turn id", () => {
    expect(
      deriveActiveWorkStartedAt(
        latestTurn,
        {
          orchestrationStatus: "running",
          activeTurnId: null,
        },
        null,
      ),
    ).toBeNull();
  });
});
