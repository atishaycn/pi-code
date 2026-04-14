import { ApprovalRequestId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";

describe("ComposerPendingUserInputPanel", () => {
  it("renders inline editor guidance for editor-style requests", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingUserInputPanel
        pendingUserInputs={[
          {
            requestId: ApprovalRequestId.makeUnsafe("req-editor-1"),
            createdAt: "2026-04-13T00:00:00.000Z",
            responseKind: "editor",
            title: "Edit response",
            prefill: "line 1\nline 2",
            questions: [
              {
                id: "req-editor-1",
                header: "Edit response",
                question: "Edit response",
                options: [
                  {
                    label: "Edit response",
                    description: "Edit response",
                  },
                ],
              },
            ],
          },
        ]}
        respondingRequestIds={[]}
        answers={{}}
        questionIndex={0}
        onSelectOption={vi.fn()}
        onAdvance={vi.fn()}
        onRestorePrefill={vi.fn()}
      />,
    );

    expect(markup).toContain("Inline editor");
    expect(markup).toContain("Restore original");
    expect(markup).toContain("Edit the full response below");
    expect(markup).not.toContain("<kbd>1</kbd>");
  });
});
