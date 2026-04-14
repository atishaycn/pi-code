import { describe, expect, it } from "vitest";

import {
  compareRankedSearchResults,
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
  scoreSubsequenceMatch,
  type RankedSearchResult,
} from "./searchRanking";

describe("normalizeSearchQuery", () => {
  it("trims, lowercases, and optionally strips leading tokens", () => {
    expect(normalizeSearchQuery("  HeLLo World  ")).toBe("hello world");
    expect(normalizeSearchQuery("$$Skill", { trimLeadingPattern: /^\$+/ })).toBe("skill");
  });
});

describe("scoreSubsequenceMatch", () => {
  it("returns a lower score for tighter subsequence matches", () => {
    const contiguous = scoreSubsequenceMatch("commandpalette", "cmd");
    const gappy = scoreSubsequenceMatch("composed-markdown", "cmd");

    expect(contiguous).not.toBeNull();
    expect(gappy).not.toBeNull();
    expect(contiguous!).toBeLessThan(gappy!);
  });

  it("returns null when the query is not a subsequence", () => {
    expect(scoreSubsequenceMatch("palette", "zzz")).toBeNull();
  });
});

describe("scoreQueryMatch", () => {
  it("prefers exact matches over prefix, boundary, includes, and fuzzy matches", () => {
    const exact = scoreQueryMatch({
      value: "ui",
      query: "ui",
      exactBase: 0,
      prefixBase: 10,
      boundaryBase: 20,
      includesBase: 30,
      fuzzyBase: 40,
    });
    const prefix = scoreQueryMatch({
      value: "ui builder",
      query: "ui",
      exactBase: 0,
      prefixBase: 10,
      boundaryBase: 20,
      includesBase: 30,
      fuzzyBase: 40,
    });
    const boundary = scoreQueryMatch({
      value: "agent ui builder",
      query: "ui",
      exactBase: 0,
      prefixBase: 10,
      boundaryBase: 20,
      includesBase: 30,
      fuzzyBase: 40,
    });
    const includes = scoreQueryMatch({
      value: "agentbuilderwithui",
      query: "ui",
      exactBase: 0,
      prefixBase: 10,
      boundaryBase: 20,
      includesBase: 30,
      fuzzyBase: 40,
    });
    const fuzzy = scoreQueryMatch({
      value: "user interface",
      query: "uf",
      exactBase: 0,
      prefixBase: 10,
      boundaryBase: 20,
      includesBase: 30,
      fuzzyBase: 40,
    });

    expect(exact).toBe(0);
    expect(prefix).not.toBeNull();
    expect(boundary).not.toBeNull();
    expect(includes).not.toBeNull();
    expect(fuzzy).not.toBeNull();
    expect(exact!).toBeLessThan(prefix!);
    expect(prefix!).toBeLessThan(boundary!);
    expect(boundary!).toBeLessThan(includes!);
    expect(includes!).toBeLessThan(fuzzy!);
  });

  it("returns null for empty values or unmatched queries", () => {
    expect(
      scoreQueryMatch({
        value: "",
        query: "ui",
        exactBase: 0,
      }),
    ).toBeNull();
    expect(
      scoreQueryMatch({
        value: "markdown",
        query: "zzz",
        exactBase: 0,
        includesBase: 10,
      }),
    ).toBeNull();
  });
});

describe("ranked search insertion", () => {
  it("keeps lower scores first and respects tie-breakers", () => {
    const ranked: RankedSearchResult<string>[] = [];

    insertRankedSearchResult(ranked, { item: "gamma", score: 10, tieBreaker: "gamma" }, 10);
    insertRankedSearchResult(ranked, { item: "alpha", score: 5, tieBreaker: "alpha" }, 10);
    insertRankedSearchResult(ranked, { item: "beta", score: 5, tieBreaker: "beta" }, 10);

    expect(ranked.map((entry) => entry.item)).toEqual(["alpha", "beta", "gamma"]);
    expect(compareRankedSearchResults(ranked[0]!, ranked[1]!)).toBeLessThan(0);
  });

  it("drops worse matches when the limit is reached", () => {
    const ranked: RankedSearchResult<string>[] = [
      { item: "best", score: 1, tieBreaker: "best" },
      { item: "mid", score: 5, tieBreaker: "mid" },
    ];

    insertRankedSearchResult(ranked, { item: "worse", score: 20, tieBreaker: "worse" }, 2);
    expect(ranked.map((entry) => entry.item)).toEqual(["best", "mid"]);

    insertRankedSearchResult(ranked, { item: "better", score: 3, tieBreaker: "better" }, 2);
    expect(ranked.map((entry) => entry.item)).toEqual(["best", "better"]);
  });
});
