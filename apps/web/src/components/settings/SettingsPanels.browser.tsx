import "../../index.css";

import { DEFAULT_SERVER_SETTINGS, type NativeApi, type ServerConfig } from "@t3tools/contracts";
import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { __resetNativeApiForTests } from "../../nativeApi";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import { resetServerStateForTests, setServerConfigSnapshot } from "../../rpc/serverState";
import { GeneralSettingsPanel } from "./SettingsPanels";

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
      otlpTracesUrl: "http://localhost:4318/v1/traces",
      otlpTracesEnabled: true,
      otlpMetricsEnabled: false,
    },
    settings: DEFAULT_SERVER_SETTINGS,
  };
}

describe("GeneralSettingsPanel observability", () => {
  beforeEach(async () => {
    resetServerStateForTests();
    await __resetNativeApiForTests();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(async () => {
    resetServerStateForTests();
    await __resetNativeApiForTests();
    document.body.innerHTML = "";
  });

  it("shows diagnostics inside About with a single logs-folder action", async () => {
    window.nativeApi = {
      server: {
        getPiDoctorReport: vi.fn().mockResolvedValue({
          version: 1,
          ok: false,
          generatedAt: "2026-04-13T00:00:00.000Z",
          summary: { total: 2, info: 0, warning: 1, error: 1 },
          diagnostics: [
            {
              id: "tools.rg.missing",
              category: "tools",
              severity: "error",
              summary: "rg is missing from PATH",
            },
          ],
        }),
      },
    } as unknown as NativeApi;
    setServerConfigSnapshot(createBaseServerConfig());

    await render(
      <AppAtomRegistryProvider>
        <GeneralSettingsPanel />
      </AppAtomRegistryProvider>,
    );

    await expect.element(page.getByText("About")).toBeInTheDocument();
    await expect.element(page.getByText("Diagnostics")).toBeInTheDocument();
    await expect.element(page.getByText("Open logs folder")).toBeInTheDocument();
    await expect
      .element(page.getByText("/repo/project/.t3/logs", { exact: true }))
      .toBeInTheDocument();
    await expect
      .element(
        page.getByText(
          "Local trace file. OTLP exporting traces to http://localhost:4318/v1/traces. Pi doctor: 1 errors, 1 warnings.",
        ),
      )
      .toBeInTheDocument();
    await expect
      .element(page.getByText("Doctor report: 2 checks, 1 errors, 1 warnings."))
      .toBeInTheDocument();
    await expect.element(page.getByText("Top issue: rg is missing from PATH")).toBeInTheDocument();
  });

  it("opens the logs folder in the preferred editor", async () => {
    const openInEditor = vi.fn<NativeApi["shell"]["openInEditor"]>().mockResolvedValue(undefined);
    window.nativeApi = {
      shell: {
        openInEditor,
      },
      server: {
        getPiDoctorReport: vi.fn().mockResolvedValue({
          version: 1,
          ok: true,
          generatedAt: "2026-04-13T00:00:00.000Z",
          summary: { total: 0, info: 0, warning: 0, error: 0 },
          diagnostics: [],
        }),
      },
    } as unknown as NativeApi;

    setServerConfigSnapshot(createBaseServerConfig());

    await render(
      <AppAtomRegistryProvider>
        <GeneralSettingsPanel />
      </AppAtomRegistryProvider>,
    );

    const openLogsButton = page.getByText("Open logs folder");
    await openLogsButton.click();

    expect(openInEditor).toHaveBeenCalledWith("/repo/project/.t3/logs", "cursor");
  });
});
