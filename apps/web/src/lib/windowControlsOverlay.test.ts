import { afterEach, describe, expect, it, vi } from "vitest";

import { syncDocumentWindowControlsOverlayClass } from "./windowControlsOverlay";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncDocumentWindowControlsOverlayClass", () => {
  it("updates the document class from the current overlay visibility", () => {
    const toggle = vi.fn();

    vi.stubGlobal("document", {
      documentElement: {
        classList: {
          toggle,
        },
      },
    });
    vi.stubGlobal("navigator", {});

    const cleanup = syncDocumentWindowControlsOverlayClass();

    expect(toggle).toHaveBeenCalledWith("wco", false);
    cleanup();
  });

  it("subscribes to geometry changes and removes the listener on cleanup", () => {
    const toggle = vi.fn();
    const overlay = {
      visible: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal("document", {
      documentElement: {
        classList: {
          toggle,
        },
      },
    });
    vi.stubGlobal("navigator", {
      windowControlsOverlay: overlay,
    });

    const cleanup = syncDocumentWindowControlsOverlayClass();

    expect(overlay.addEventListener).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith("wco", true);

    const registeredListener = overlay.addEventListener.mock.calls[0]?.[1] as
      | ((event: Event) => void)
      | undefined;

    overlay.visible = false;
    registeredListener?.(new Event("geometrychange"));
    expect(toggle).toHaveBeenLastCalledWith("wco", false);

    cleanup();
    expect(overlay.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
