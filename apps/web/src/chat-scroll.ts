export const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 64;
export const AUTO_SCROLL_TOP_THRESHOLD_PX = 64;

interface ScrollPosition {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

function normalizeThreshold(thresholdPx: number, fallback: number): number {
  return Number.isFinite(thresholdPx) ? Math.max(0, thresholdPx) : fallback;
}

export function isScrollContainerNearBottom(
  position: ScrollPosition,
  thresholdPx = AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
): boolean {
  const threshold = normalizeThreshold(thresholdPx, AUTO_SCROLL_BOTTOM_THRESHOLD_PX);

  const { scrollTop, clientHeight, scrollHeight } = position;
  if (![scrollTop, clientHeight, scrollHeight].every(Number.isFinite)) {
    return true;
  }

  const distanceFromBottom = scrollHeight - clientHeight - scrollTop;
  return distanceFromBottom <= threshold;
}

export function isScrollContainerNearTop(
  position: ScrollPosition,
  thresholdPx = AUTO_SCROLL_TOP_THRESHOLD_PX,
): boolean {
  const threshold = normalizeThreshold(thresholdPx, AUTO_SCROLL_TOP_THRESHOLD_PX);

  const { scrollTop } = position;
  if (!Number.isFinite(scrollTop)) {
    return true;
  }

  return scrollTop <= threshold;
}
