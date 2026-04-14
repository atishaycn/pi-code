import fs from "node:fs";
import path from "node:path";

import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import { Effect } from "effect";

import { appendThreadStatusDebugLog, resolveThreadStatusLogPath } from "./threadStatusDebugLog";

describe("threadStatusDebugLog", () => {
  it("appends ndjson records to a thread-scoped log file", async () => {
    const logsDir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "t3-thread-status-"));
    const threadId = ThreadId.makeUnsafe("thread/debug-status");

    try {
      const first = await Effect.runPromise(
        appendThreadStatusDebugLog({
          logsDir,
          threadId,
          recordJson: JSON.stringify({ status: "Working", seq: 1 }),
        }),
      );
      await Effect.runPromise(
        appendThreadStatusDebugLog({
          logsDir,
          threadId,
          recordJson: JSON.stringify({ status: "Completed", seq: 2 }),
        }),
      );

      const filePath = resolveThreadStatusLogPath(logsDir, threadId);
      expect(first.path).toBe(filePath);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, "utf8").trim().split("\n")).toEqual([
        JSON.stringify({ status: "Working", seq: 1 }),
        JSON.stringify({ status: "Completed", seq: 2 }),
      ]);
    } finally {
      fs.rmSync(logsDir, { recursive: true, force: true });
    }
  });
});
