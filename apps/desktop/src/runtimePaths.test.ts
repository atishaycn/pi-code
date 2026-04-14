import * as OS from "node:os";

import { describe, expect, it } from "vitest";

import {
  resolveDesktopBackendCwd,
  resolveDesktopBaseDir,
  sanitizeDesktopBackendEnv,
} from "./runtimePaths";

describe("runtimePaths", () => {
  it("prefers PI_T3CODE_HOME over T3CODE_HOME for desktop state", () => {
    expect(
      resolveDesktopBaseDir({
        PI_T3CODE_HOME: "/tmp/pi-home",
        T3CODE_HOME: "/tmp/t3-home",
      }),
    ).toBe("/tmp/pi-home");
  });

  it("ignores generic T3CODE_HOME and defaults desktop state to ~/.pi-t3code", () => {
    expect(
      resolveDesktopBaseDir({
        T3CODE_HOME: "/tmp/t3-home",
      }),
    ).toBe(`${OS.homedir()}/.pi-t3code`);
  });

  it("defaults desktop state to ~/.pi-t3code", () => {
    expect(resolveDesktopBaseDir({})).toBe(`${OS.homedir()}/.pi-t3code`);
  });

  it("always uses the user home directory for backend cwd", () => {
    expect(resolveDesktopBackendCwd()).toBe(OS.homedir());
  });

  it("strips repo-shell server env before starting desktop backend", () => {
    expect(
      sanitizeDesktopBackendEnv({
        T3CODE_PORT: "3773",
        T3CODE_AUTH_TOKEN: "secret",
        T3CODE_MODE: "web",
        T3CODE_NO_BROWSER: "1",
        T3CODE_HOST: "127.0.0.1",
        T3CODE_DESKTOP_WS_URL: "ws://x",
        T3CODE_HOME: "/tmp/t3-home",
        T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD: "1",
        VITE_DEV_SERVER_URL: "http://localhost:5733",
        KEEP_ME: "yes",
      }),
    ).toEqual({
      KEEP_ME: "yes",
    });
  });
});
