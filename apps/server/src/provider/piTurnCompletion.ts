import type { PiRpcEvent } from "./pi/PiRpc";

export const PI_TURN_COMPLETION_QUIET_PERIOD_MS = 2_000;

export function isPiTurnCompletionTerminalEvent(
  event: PiRpcEvent,
): event is Extract<PiRpcEvent, { type: "turn_end" | "agent_end" }> {
  return event.type === "turn_end" || event.type === "agent_end";
}

export function shouldPiTurnCompletionStayOpen(event: PiRpcEvent): boolean {
  switch (event.type) {
    case "turn_end":
    case "agent_end":
    case "queue_update":
      return false;
    default:
      return true;
  }
}
