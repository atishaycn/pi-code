import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import type { ServerProvider } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { generatePiDoctorReport } from "./piDoctor";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await FS.mkdtemp(Path.join(OS.tmpdir(), "pi-doctor-"));
  tempDirs.push(dir);
  return dir;
}

async function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = Path.join(root, relativePath);
  await FS.mkdir(Path.dirname(absolutePath), { recursive: true });
  await FS.writeFile(absolutePath, contents, "utf8");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => FS.rm(dir, { recursive: true, force: true })));
});

function makeProvider(overrides: Partial<ServerProvider> = {}): ServerProvider {
  return {
    provider: "codex",
    enabled: true,
    installed: true,
    version: "0.1.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-04-13T00:00:00.000Z",
    models: [],
    ...overrides,
  };
}

describe("generatePiDoctorReport", () => {
  it("returns ok report for healthy coding runtime inputs", async () => {
    const root = await createTempDir();
    const settingsPath = Path.join(root, "state", "settings.json");
    await writeFile(
      root,
      "state/settings.json",
      JSON.stringify({ enableAssistantStreaming: true }),
    );

    const report = await generatePiDoctorReport({
      cwd: root,
      settingsPath,
      providers: [makeProvider()],
      piHomePath: Path.join(root, ".pi", "agent"),
      commandExists: async () => true,
    });

    expect(report.ok).toBe(true);
    expect(report.summary.error).toBe(0);
    expect(report.diagnostics).toHaveLength(0);
  });

  it("reports invalid settings, models, sessions, tools, and auth", async () => {
    const root = await createTempDir();
    const piHomePath = Path.join(root, ".pi", "agent");
    const settingsPath = Path.join(root, "state", "settings.json");

    await writeFile(root, "state/settings.json", "{ broken json");
    await writeFile(root, ".pi/agent/models.json", "{ broken models");
    await writeFile(root, ".pi/agent/sessions/thread-1/events.jsonl", '{"ok":true}\nnot-json');

    const report = await generatePiDoctorReport({
      cwd: root,
      settingsPath,
      providers: [
        makeProvider({
          installed: false,
          auth: { status: "unauthenticated" },
          status: "error",
          message: "login required",
        }),
      ],
      piHomePath,
      commandExists: async (command) => command === "bash",
    });

    expect(report.ok).toBe(false);
    expect(report.summary.total).toBe(report.diagnostics.length);
    expect(report.summary.error).toBe(
      report.diagnostics.filter((entry) => entry.severity === "error").length,
    );
    expect(report.summary.warning).toBe(
      report.diagnostics.filter((entry) => entry.severity === "warning").length,
    );
    expect(report.diagnostics.some((entry) => entry.id === "settings.server.invalid")).toBe(true);
    expect(report.diagnostics.some((entry) => entry.id === "models.global.invalid")).toBe(true);
    expect(report.diagnostics.some((entry) => entry.id === "sessions.corrupt-jsonl")).toBe(true);
    expect(report.diagnostics.some((entry) => entry.id === "tools.git.missing")).toBe(true);
    expect(report.diagnostics.some((entry) => entry.id === "auth.codex.missing")).toBe(true);
    expect(report.diagnostics.some((entry) => entry.id === "tools.codex.binary-missing")).toBe(
      true,
    );
    expect(report.diagnostics[0]?.severity).toBe("error");
    expect(report.diagnostics.at(-1)?.severity).toBe("warning");
  });
});
