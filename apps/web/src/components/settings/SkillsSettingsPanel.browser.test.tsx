import "../../index.css";

import { type NativeApi, type ServerConfig, DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { __resetNativeApiForTests } from "../../nativeApi";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import { resetServerStateForTests, setServerConfigSnapshot } from "../../rpc/serverState";
import { SkillsSettingsPanel } from "./SkillsSettingsPanel";

function createBaseServerConfig(): ServerConfig {
  return {
    cwd: "/repo/project",
    keybindingsConfigPath: "/repo/project/.t3code-keybindings.json",
    keybindings: [],
    issues: [],
    providers: [],
    availableEditors: ["cursor"],
    observability: {
      logsDirectoryPath: "/repo/project/.t3/logs",
      localTracingEnabled: true,
      otlpTracesEnabled: false,
      otlpMetricsEnabled: false,
    },
    settings: DEFAULT_SERVER_SETTINGS,
  };
}

describe("SkillsSettingsPanel", () => {
  beforeEach(async () => {
    resetServerStateForTests();
    await __resetNativeApiForTests();
    document.body.innerHTML = "";
  });

  afterEach(async () => {
    resetServerStateForTests();
    await __resetNativeApiForTests();
    document.body.innerHTML = "";
  });

  it("shows installed skills and filters non-skill resources", async () => {
    const getPiWorkspace = vi.fn<NativeApi["server"]["getPiWorkspace"]>().mockResolvedValue({
      globalRoot: "/Users/test/.pi/agent",
      projectRoot: "/repo/project/.pi",
      resources: [
        {
          kind: "skill",
          scope: "project",
          label: "Review Follow Up",
          path: "/repo/project/.pi/skills/review-follow-up/SKILL.md",
          description: "review-follow-up/SKILL.md",
        },
        {
          kind: "skill",
          scope: "global",
          label: "Ship It",
          path: "/Users/test/.pi/agent/skills/ship-it/SKILL.md",
          description: "ship-it/SKILL.md",
        },
        {
          kind: "settings",
          scope: "project",
          label: "Project settings.json",
          path: "/repo/project/.pi/settings.json",
        },
      ],
    });
    const readPiResource = vi.fn<NativeApi["server"]["readPiResource"]>().mockResolvedValue({
      path: "/repo/project/.pi/skills/review-follow-up/SKILL.md",
      contents: "# Review Follow Up\n",
    });

    window.nativeApi = {
      server: {
        getPiWorkspace,
        readPiResource,
        writePiResource: vi.fn(),
      },
    } as unknown as NativeApi;

    setServerConfigSnapshot(createBaseServerConfig());

    await render(
      <AppAtomRegistryProvider>
        <SkillsSettingsPanel />
      </AppAtomRegistryProvider>,
    );

    await expect.element(page.getByText("Installed")).toBeInTheDocument();
    await expect.element(page.getByText("2")).toBeInTheDocument();
    await expect.element(page.getByText("Review Follow Up")).toBeInTheDocument();
    await expect.element(page.getByText("Ship It")).toBeInTheDocument();
    await expect.element(page.getByText("Project settings.json")).toBeInTheDocument();
    expect(getPiWorkspace).toHaveBeenCalled();
    expect(readPiResource).toHaveBeenCalledWith({
      path: "/repo/project/.pi/skills/review-follow-up/SKILL.md",
    });
  });

  it("creates a new project skill", async () => {
    const getPiWorkspace = vi.fn<NativeApi["server"]["getPiWorkspace"]>().mockResolvedValue({
      globalRoot: "/Users/test/.pi/agent",
      projectRoot: "/repo/project/.pi",
      resources: [
        {
          kind: "settings",
          scope: "project",
          label: "Project settings.json",
          path: "/repo/project/.pi/settings.json",
        },
      ],
    });
    const writePiResource = vi.fn<NativeApi["server"]["writePiResource"]>().mockResolvedValue({
      path: "/repo/project/.pi/skills/new-skill/SKILL.md",
    });

    window.nativeApi = {
      server: {
        getPiWorkspace,
        readPiResource: vi.fn(),
        writePiResource,
      },
    } as unknown as NativeApi;

    setServerConfigSnapshot(createBaseServerConfig());

    await render(
      <AppAtomRegistryProvider>
        <SkillsSettingsPanel />
      </AppAtomRegistryProvider>,
    );

    await page.getByText("New skill").click();
    await page.getByLabelText("Skill name").fill("new skill");
    await page.getByText("Create skill").click();

    await expect.poll(() => writePiResource.mock.calls.length).toBe(1);
    expect(writePiResource).toHaveBeenCalledWith({
      path: "/repo/project/.pi/skills/new-skill/SKILL.md",
      contents: expect.stringContaining("name: new-skill"),
    });
  });
});
