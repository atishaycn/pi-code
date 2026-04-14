import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OpenClawRoadmapDashboard } from "./OpenClawRoadmapDashboard";

describe("OpenClawRoadmapDashboard", () => {
  it("renders the OpenClaw roadmap summary, docs, and workstreams", () => {
    const markup = renderToStaticMarkup(<OpenClawRoadmapDashboard />);

    expect(markup).toContain("OpenClaw roadmap control center");
    expect(markup).toContain("docs/pi-openclaw-roadmap.md");
    expect(markup).toContain("docs/pi-openclaw-implementation-backlog.md");
    expect(markup).toContain("Diagnostics &amp; Repair");
    expect(markup).toContain("Runtime Resilience");
    expect(markup).toContain("OpenClaw roadmap");
    expect(markup).toContain("pi doctor");
    expect(markup).toContain("Refresh status");
    expect(markup).toContain("Implement current step");
    expect(markup).toContain("Working step:");
    expect(markup).toContain("Working now");
  });
});
