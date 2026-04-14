import fs from "node:fs/promises";
import path from "node:path";

import { type ThreadId } from "@t3tools/contracts";
import { Data, Effect } from "effect";

import { toSafeThreadAttachmentSegment } from "./attachmentStore";

const THREAD_STATUS_LOG_DIRNAME = "thread-status";

class ThreadStatusDebugLogError extends Data.TaggedError("ThreadStatusDebugLogError")<{
  message: string;
  cause?: unknown;
}> {}

export function resolveThreadStatusLogPath(logsDir: string, threadId: ThreadId): string {
  const threadSegment = toSafeThreadAttachmentSegment(threadId) ?? "unknown-thread";
  return path.join(logsDir, THREAD_STATUS_LOG_DIRNAME, `${threadSegment}.ndjson`);
}

export const appendThreadStatusDebugLog = Effect.fn("appendThreadStatusDebugLog")(
  function* (input: {
    readonly logsDir: string;
    readonly threadId: ThreadId;
    readonly recordJson: string;
  }) {
    const normalizedRecord = input.recordJson.trim();
    if (normalizedRecord.length === 0) {
      throw new ThreadStatusDebugLogError({
        message: "Thread status log record must not be empty.",
      });
    }

    const filePath = resolveThreadStatusLogPath(input.logsDir, input.threadId);
    yield* Effect.tryPromise({
      try: async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(filePath, `${normalizedRecord}\n`, "utf8");
      },
      catch: (cause) =>
        new ThreadStatusDebugLogError({
          message: "Failed to append thread status log record.",
          cause,
        }),
    });
    return { path: filePath };
  },
);
