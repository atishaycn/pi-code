import { describe, expect, it } from "vitest";
import {
  buildPiLauncherEnv,
  extractAssistantText,
  extractAssistantThinking,
  type PiRpcAssistantMessage,
  resolvePiLauncherInvocation,
} from "./PiRpc";

describe("PiRpc launcher invocation", () => {
  it("enables autoreason only for pi-test wrappers when setting is on", () => {
    expect(
      resolvePiLauncherInvocation({
        binaryPath: "/Users/test/Developer/pi-mono/pi-test.sh",
        enableAutoreason: true,
      }),
    ).toEqual({
      binaryPath: "/Users/test/Developer/pi-mono/pi-test.sh",
      args: ["--enable-autoreason"],
    });

    expect(
      resolvePiLauncherInvocation({ binaryPath: "/usr/local/bin/pi", enableAutoreason: true }),
    ).toEqual({
      binaryPath: "/usr/local/bin/pi",
      args: [],
    });

    expect(
      resolvePiLauncherInvocation({
        binaryPath: "/Users/test/Developer/pi-mono/pi-test.sh",
        enableAutoreason: false,
      }),
    ).toEqual({
      binaryPath: "/Users/test/Developer/pi-mono/pi-test.sh",
      args: [],
    });
  });

  it("appends full autonomy launcher flag when enabled", () => {
    expect(
      resolvePiLauncherInvocation({
        binaryPath: "/usr/local/bin/pi",
        fullAutonomy: true,
      }),
    ).toEqual({
      binaryPath: "/usr/local/bin/pi",
      args: ["--full-autonomy"],
    });

    expect(
      resolvePiLauncherInvocation({
        binaryPath: "/Users/test/Developer/pi-mono/pi-test.sh",
        enableAutoreason: true,
        fullAutonomy: true,
      }),
    ).toEqual({
      binaryPath: "/Users/test/Developer/pi-mono/pi-test.sh",
      args: ["--enable-autoreason", "--full-autonomy"],
    });
  });
});

describe("PiRpc launcher env", () => {
  it("builds embedded launcher env with Pi home path and telemetry disabled", () => {
    expect(
      buildPiLauncherEnv({
        homePath: "  /tmp/pi-home  ",
        disableTelemetry: true,
        env: { EXISTING: "1" },
      }),
    ).toEqual({
      EXISTING: "1",
      PI_CODING_AGENT_DIR: "/tmp/pi-home",
      PI_TELEMETRY: "0",
    });
  });

  it("leaves telemetry untouched when disableTelemetry is off", () => {
    expect(buildPiLauncherEnv({ env: { PI_TELEMETRY: "1" } })).toEqual({
      PI_TELEMETRY: "1",
    });
  });
});

describe("PiRpc assistant content extraction", () => {
  it("extracts visible assistant text without mixing in thinking blocks", () => {
    const message: PiRpcAssistantMessage = {
      role: "assistant",
      provider: "openrouter",
      model: "test-model",
      stopReason: "end_turn",
      timestamp: 0,
      content: [
        { type: "thinking", thinking: "first thought" },
        { type: "text", text: "Hello" },
        { type: "thinking", thinking: " second thought" },
        { type: "text", text: " world" },
      ],
    };

    expect(extractAssistantText(message)).toBe("Hello world");
    expect(extractAssistantThinking(message)).toBe("first thought second thought");
  });

  it("ignores redacted thinking blocks", () => {
    const message: PiRpcAssistantMessage = {
      role: "assistant",
      provider: "openrouter",
      model: "test-model",
      stopReason: "end_turn",
      timestamp: 0,
      content: [
        { type: "thinking", thinking: "secret", redacted: true },
        { type: "thinking", thinking: "visible" },
      ],
    };

    expect(extractAssistantThinking(message)).toBe("visible");
  });
});
