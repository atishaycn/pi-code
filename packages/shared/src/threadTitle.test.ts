import { describe, expect, it } from "vitest";

import { DEFAULT_THREAD_TITLE, sanitizeThreadTitle } from "./threadTitle";

describe("sanitizeThreadTitle", () => {
  it("keeps short single-line titles unchanged", () => {
    expect(sanitizeThreadTitle("Fix reconnect spinner")).toBe("Fix reconnect spinner");
  });

  it("uses the first line only", () => {
    expect(sanitizeThreadTitle("Fix reconnect spinner\nwith more detail")).toBe(
      "Fix reconnect spinner",
    );
  });

  it("strips wrapping quotes and extra whitespace", () => {
    expect(sanitizeThreadTitle(`  "' hello world '"  `)).toBe("hello world");
  });

  it("falls back to the default thread title when normalization becomes empty", () => {
    expect(sanitizeThreadTitle('  """   """  ')).toBe(DEFAULT_THREAD_TITLE);
  });

  it("caps titles to 50 characters including ellipsis", () => {
    const title = sanitizeThreadTitle(
      "Investigate websocket reconnect regressions after worktree restore",
    );

    expect(title).toBe("Investigate websocket reconnect regressions aft...");
    expect(title).toHaveLength(50);
  });
});
