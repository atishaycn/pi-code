export const STARTUP_DRAFT_ROUTE_WINDOW_MS = 15_000;
export const STALE_DRAFT_ROUTE_MIN_AGE_MS = 60_000;

export function shouldRedirectStartupDraftRoute(input: {
  isElectron: boolean;
  routeIsDraftOnly: boolean;
  startupElapsedMs: number;
  draftCreatedAt: string | null;
  nowMs?: number;
}): boolean {
  if (!input.isElectron || !input.routeIsDraftOnly) {
    return false;
  }

  if (input.startupElapsedMs > STARTUP_DRAFT_ROUTE_WINDOW_MS) {
    return false;
  }

  if (!input.draftCreatedAt) {
    return true;
  }

  const createdAtMs = Date.parse(input.draftCreatedAt);
  if (!Number.isFinite(createdAtMs)) {
    return true;
  }

  const nowMs = input.nowMs ?? Date.now();
  return nowMs - createdAtMs >= STALE_DRAFT_ROUTE_MIN_AGE_MS;
}
