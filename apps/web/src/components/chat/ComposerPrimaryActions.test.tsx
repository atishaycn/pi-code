import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ComposerPrimaryActions } from "./ComposerPrimaryActions";

const noop = () => undefined;

function renderComposerPrimaryActions(
  props: Partial<ComponentProps<typeof ComposerPrimaryActions>> = {},
): string {
  return renderToStaticMarkup(
    <ComposerPrimaryActions
      compact={false}
      pendingAction={null}
      isRunning={false}
      queuedCount={0}
      showPlanFollowUpPrompt={false}
      promptHasText={false}
      isSendBusy={false}
      isConnecting={false}
      isPreparingWorktree={false}
      hasSendableContent={true}
      onPreviousPendingQuestion={noop}
      onInterrupt={noop}
      onSteerNow={noop}
      onImplementPlanInNewThread={noop}
      {...props}
    />,
  );
}

describe("ComposerPrimaryActions", () => {
  it("shows the idle send control when the thread is ready for a new message", () => {
    const html = renderComposerPrimaryActions();

    expect(html).toContain('data-testid="composer-send-message"');
    expect(html).toContain('aria-label="Send message"');
    expect(html).not.toContain("Steer now");
  });

  it("shows ongoing-turn controls when the thread is running and there is follow-up text", () => {
    const html = renderComposerPrimaryActions({
      isRunning: true,
      hasSendableContent: true,
      queuedCount: 1,
    });

    expect(html).toContain('data-testid="composer-steer-now"');
    expect(html).toContain("Steer now");
    expect(html).toContain('data-testid="composer-queue-followup"');
    expect(html).toContain("Queue next (2)");
    expect(html).toContain('data-testid="composer-stop-generation"');
    expect(html).toContain("Stop");
    expect(html).not.toContain('data-testid="composer-send-message"');
  });

  it("falls back to a stop-only control when the turn is running without sendable follow-up content", () => {
    const html = renderComposerPrimaryActions({
      isRunning: true,
      hasSendableContent: false,
    });

    expect(html).toContain('data-testid="composer-stop-generation"');
    expect(html).toContain('aria-label="Stop generation"');
    expect(html).not.toContain("Steer now");
    expect(html).not.toContain('data-testid="composer-send-message"');
  });
});
