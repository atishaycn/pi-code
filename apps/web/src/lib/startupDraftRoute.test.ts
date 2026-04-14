import { describe, expect, it } from "vitest";

import {
  shouldRedirectStartupDraftRoute,
  STALE_DRAFT_ROUTE_MIN_AGE_MS,
  STARTUP_DRAFT_ROUTE_WINDOW_MS,
} from "./startupDraftRoute";

describe("shouldRedirectStartupDraftRoute", () => {
  it("redirects stale desktop startup routes that only point to old persisted draft threads", () => {
    const nowMs = Date.parse("2026-04-14T18:00:00.000Z");
    expect(
      shouldRedirectStartupDraftRoute({
        isElectron: true,
        routeIsDraftOnly: true,
        startupElapsedMs: STARTUP_DRAFT_ROUTE_WINDOW_MS - 1,
        draftCreatedAt: new Date(nowMs - STALE_DRAFT_ROUTE_MIN_AGE_MS).toISOString(),
        nowMs,
      }),
    ).toBe(true);
  });

  it("does not redirect normal server-backed routes", () => {
    expect(
      shouldRedirectStartupDraftRoute({
        isElectron: true,
        routeIsDraftOnly: false,
        startupElapsedMs: 100,
        draftCreatedAt: null,
      }),
    ).toBe(false);
  });

  it("does not redirect fresh drafts created right after startup", () => {
    const nowMs = Date.parse("2026-04-14T18:00:00.000Z");
    expect(
      shouldRedirectStartupDraftRoute({
        isElectron: true,
        routeIsDraftOnly: true,
        startupElapsedMs: 500,
        draftCreatedAt: new Date(nowMs - 5_000).toISOString(),
        nowMs,
      }),
    ).toBe(false);
  });

  it("does not redirect after the startup window passes", () => {
    const nowMs = Date.parse("2026-04-14T18:00:00.000Z");
    expect(
      shouldRedirectStartupDraftRoute({
        isElectron: true,
        routeIsDraftOnly: true,
        startupElapsedMs: STARTUP_DRAFT_ROUTE_WINDOW_MS + 1,
        draftCreatedAt: new Date(nowMs - 60 * 60 * 1000).toISOString(),
        nowMs,
      }),
    ).toBe(false);
  });

  it("does not redirect in browser mode", () => {
    expect(
      shouldRedirectStartupDraftRoute({
        isElectron: false,
        routeIsDraftOnly: true,
        startupElapsedMs: 100,
        draftCreatedAt: null,
      }),
    ).toBe(false);
  });
});
