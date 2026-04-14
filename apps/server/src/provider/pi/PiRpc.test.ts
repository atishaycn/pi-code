import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

import { describe, expect, it } from "vitest";
import {
  buildPiLauncherEnv,
  extractAssistantText,
  extractAssistantThinking,
  prepareEmbeddedPiLauncherEnv,
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

  it("isolates embedded pi homes from global extensions while preserving auth and models", async () => {
    const sourceAgentDir = await FS.promises.mkdtemp(
      Path.join(OS.tmpdir(), "pi-rpc-source-agent-"),
    );
    const authPath = Path.join(sourceAgentDir, "auth.json");
    const modelsPath = Path.join(sourceAgentDir, "models.json");
    const settingsPath = Path.join(sourceAgentDir, "settings.json");

    await FS.promises.writeFile(authPath, '{"token":"secret"}\n', "utf8");
    await FS.promises.writeFile(modelsPath, '{"models":["a"]}\n', "utf8");
    await FS.promises.writeFile(
      settingsPath,
      `${JSON.stringify(
        {
          packages: [
            "git:github.com/nicobailon/pi-subagents",
            { source: "npm:@acme/pi-pack", skills: ["keep-me"], extensions: ["*"] },
          ],
          extensions: ["./extensions/local.ts"],
          skills: ["./skills"],
          prompts: ["./prompts"],
          themes: ["./themes"],
          defaultProvider: "openrouter",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    try {
      const preparedEnv = await prepareEmbeddedPiLauncherEnv({
        PI_CODING_AGENT_DIR: sourceAgentDir,
        EXISTING: "1",
      });
      const isolatedAgentDir = preparedEnv?.PI_CODING_AGENT_DIR;
      expect(isolatedAgentDir).toBeDefined();
      expect(isolatedAgentDir).not.toBe(sourceAgentDir);
      expect(preparedEnv).toMatchObject({ EXISTING: "1" });

      const copiedAuth = await FS.promises.readFile(
        Path.join(isolatedAgentDir!, "auth.json"),
        "utf8",
      );
      const copiedModels = await FS.promises.readFile(
        Path.join(isolatedAgentDir!, "models.json"),
        "utf8",
      );
      const copiedSettings = JSON.parse(
        await FS.promises.readFile(Path.join(isolatedAgentDir!, "settings.json"), "utf8"),
      ) as Record<string, unknown>;

      expect(copiedAuth).toContain("secret");
      expect(copiedModels).toContain('"a"');
      expect(copiedSettings.defaultProvider).toBe("openrouter");
      expect(copiedSettings.extensions).toBeUndefined();
      expect(copiedSettings.skills).toBeUndefined();
      expect(copiedSettings.prompts).toBeUndefined();
      expect(copiedSettings.themes).toBeUndefined();
      expect(copiedSettings.packages).toEqual([
        {
          source: "git:github.com/nicobailon/pi-subagents",
          extensions: [],
        },
        {
          source: "npm:@acme/pi-pack",
          skills: ["keep-me"],
          extensions: [],
        },
      ]);
    } finally {
      await FS.promises.rm(sourceAgentDir, { recursive: true, force: true });
    }
  });

  it("isolates default ~/.pi/agent when no explicit home path is configured", async () => {
    const fakeHome = await FS.promises.mkdtemp(Path.join(OS.tmpdir(), "pi-rpc-home-"));
    const sourceAgentDir = Path.join(fakeHome, ".pi", "agent");
    await FS.promises.mkdir(sourceAgentDir, { recursive: true });
    await FS.promises.writeFile(
      Path.join(sourceAgentDir, "settings.json"),
      `${JSON.stringify({ packages: ["git:github.com/nicobailon/pi-subagents"] }, null, 2)}\n`,
      "utf8",
    );

    const priorHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const preparedEnv = await prepareEmbeddedPiLauncherEnv({ EXISTING: "1" });
      const isolatedAgentDir = preparedEnv?.PI_CODING_AGENT_DIR;
      expect(isolatedAgentDir).toBeDefined();
      expect(isolatedAgentDir).not.toBe(sourceAgentDir);
      const copiedSettings = JSON.parse(
        await FS.promises.readFile(Path.join(isolatedAgentDir!, "settings.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(copiedSettings.packages).toEqual([
        {
          source: "git:github.com/nicobailon/pi-subagents",
          extensions: [],
        },
      ]);
    } finally {
      if (priorHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = priorHome;
      }
      await FS.promises.rm(fakeHome, { recursive: true, force: true });
    }
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
