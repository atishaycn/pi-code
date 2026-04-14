import { describe, expect, it } from "vitest";
import { findWorkRowSkipScrollTop } from "./scrollSkip";

describe("findWorkRowSkipScrollTop", () => {
  const rows = [
    { id: "user-1", kind: "message" as const, top: 0, bottom: 80 },
    { id: "work-1", kind: "work" as const, top: 80, bottom: 120 },
    { id: "work-2", kind: "work" as const, top: 120, bottom: 160 },
    { id: "assistant-1", kind: "message" as const, top: 160, bottom: 260 },
    { id: "plan-1", kind: "proposed-plan" as const, top: 260, bottom: 340 },
  ];

  it("skips downward from a message directly to the first row after a work block", () => {
    expect(findWorkRowSkipScrollTop({ rows, scrollTop: 0, direction: "down" })).toBe(160);
  });

  it("skips downward when the viewport already starts inside a work block", () => {
    expect(findWorkRowSkipScrollTop({ rows, scrollTop: 90, direction: "down" })).toBe(160);
  });

  it("skips upward from a message to the row before the preceding work block", () => {
    expect(findWorkRowSkipScrollTop({ rows, scrollTop: 160, direction: "up" })).toBe(0);
  });

  it("skips upward when the viewport already starts inside a work block", () => {
    expect(findWorkRowSkipScrollTop({ rows, scrollTop: 120, direction: "up" })).toBe(0);
  });

  it("returns null when no work block is adjacent in the scroll direction", () => {
    expect(findWorkRowSkipScrollTop({ rows, scrollTop: 260, direction: "down" })).toBeNull();
    expect(findWorkRowSkipScrollTop({ rows, scrollTop: 0, direction: "up" })).toBeNull();
  });

  it("returns null when a work block reaches the end while scrolling down", () => {
    expect(
      findWorkRowSkipScrollTop({
        rows: [
          { id: "assistant-1", kind: "message", top: 0, bottom: 80 },
          { id: "work-1", kind: "work", top: 80, bottom: 120 },
        ],
        scrollTop: 0,
        direction: "down",
      }),
    ).toBeNull();
  });
});
