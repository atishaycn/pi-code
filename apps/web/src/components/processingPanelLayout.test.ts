import { describe, expect, it } from "vitest";

import {
  LATEST_REASONING_PREVIEW_MAX_HEIGHT_CLASS,
  LIVE_REASONING_PANEL_MAX_HEIGHT_CLASS,
  PROCESSING_PANEL_SCROLL_BEHAVIOR_CLASS,
  QUEUED_FOLLOWUPS_PANEL_MAX_HEIGHT_CLASS,
} from "./processingPanelLayout";

describe("processingPanelLayout", () => {
  it("keeps the live reasoning surfaces constrained to viewport-relative heights", () => {
    expect(LIVE_REASONING_PANEL_MAX_HEIGHT_CLASS).toBe("max-h-[min(22rem,45dvh)]");
    expect(LATEST_REASONING_PREVIEW_MAX_HEIGHT_CLASS).toBe("max-h-[min(16rem,32dvh)]");
    expect(QUEUED_FOLLOWUPS_PANEL_MAX_HEIGHT_CLASS).toBe("max-h-[min(18rem,36dvh)]");
  });

  it("keeps tall processing panels internally scrollable", () => {
    expect(PROCESSING_PANEL_SCROLL_BEHAVIOR_CLASS).toBe("overflow-y-auto overscroll-y-contain");
  });
});
