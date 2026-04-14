import { describe, expect, it } from "vitest";

import {
  buildDevelopmentRestartCommand,
  DEFAULT_DESKTOP_RESTART_ROOT,
  quotePosixShell,
} from "./restartApp";

describe("quotePosixShell", () => {
  it("wraps values in single quotes", () => {
    expect(quotePosixShell("/tmp/workspace")).toBe("'/tmp/workspace'");
  });

  it("escapes embedded single quotes", () => {
    expect(quotePosixShell("/tmp/garry's project")).toBe("'/tmp/garry'\"'\"'s project'");
  });
});

describe("buildDevelopmentRestartCommand", () => {
  it("builds the desktop restart script command sequence", () => {
    expect(buildDevelopmentRestartCommand()).toBe(
      [`cd '${DEFAULT_DESKTOP_RESTART_ROOT}'`, "bun run restart:desktop"].join("\n"),
    );
  });

  it("quotes custom roots with shell-sensitive characters", () => {
    const rootDir = "/tmp/garry's projects/pi code";

    expect(buildDevelopmentRestartCommand(rootDir)).toBe(
      [`cd '/tmp/garry'"'"'s projects/pi code'`, "bun run restart:desktop"].join("\n"),
    );
  });

  it("rejects empty roots", () => {
    expect(() => buildDevelopmentRestartCommand("   ")).toThrow(
      "Desktop restart root directory cannot be empty.",
    );
  });
});
