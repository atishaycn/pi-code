import * as crypto from "node:crypto";
import * as FS from "node:fs";
import * as Path from "node:path";

import {
  type ChatAttachment,
  EventId,
  type ModelSelection,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderTurnStartResult,
  RuntimeItemId,
  RuntimeRequestId,
  type RuntimeMode,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { Effect, Layer, PubSub, Schema, Stream } from "effect";

import { resolveAttachmentPath } from "../../attachmentStore";
import { ServerConfig } from "../../config";
import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
} from "../Errors";
import { CodexAdapter, type CodexAdapterShape } from "../Services/CodexAdapter";
import { ServerSettingsService } from "../../serverSettings";
import {
  type PiRpcAssistantMessage,
  type PiRpcEvent,
  type PiRpcExtensionUiRequest,
  type PiRpcImageContent,
  type PiRpcSessionStats,
  buildPiLauncherEnv,
  extractAssistantText,
  extractAssistantThinking,
  extractDiffText,
  PiRpcProcess,
  resolvePiLauncherPath,
  type PiRpcSessionState,
  type PiThinkingLevel,
} from "../pi/PiRpc";
import {
  isPiTurnCompletionTerminalEvent,
  PI_TURN_COMPLETION_QUIET_PERIOD_MS,
  shouldPiTurnCompletionStayOpen,
} from "../piTurnCompletion";

const PROVIDER = "codex" as const;
const PI_SESSION_DIRECTORY = "pi-sessions";
const DEFAULT_MODEL_SLUG = "default";
const DEFAULT_THINKING_LEVEL: PiThinkingLevel = "medium";

type PendingUserInputRequest =
  | {
      readonly kind: "confirm";
      readonly id: string;
      readonly questionId: string;
      readonly confirmLabel: string;
      readonly cancelLabel: string;
    }
  | {
      readonly kind: "select";
      readonly id: string;
      readonly questionId: string;
      readonly options: ReadonlyArray<string>;
    }
  | {
      readonly kind: "input" | "editor";
      readonly id: string;
      readonly questionId: string;
      readonly title: string;
      readonly placeholder?: string;
      readonly prefill?: string;
    };

interface ToolLifecycleState {
  readonly runtimeItemId: string;
  readonly itemType:
    | "command_execution"
    | "file_change"
    | "mcp_tool_call"
    | "image_view"
    | "web_search";
  readonly title: string;
  readonly args?: Record<string, unknown>;
}

interface PendingTurnCompletion {
  readonly state: "completed" | "failed" | "interrupted" | "cancelled";
  readonly requestedAt: string;
  readonly errorMessage?: string;
  timeoutId: ReturnType<typeof globalThis.setTimeout> | null;
}

interface TurnState {
  readonly turnId: TurnId;
  readonly startedAt: string;
  readonly requestedAt: string;
  readonly requestedModel: string | null;
  aborted: boolean;
  failureMessage?: string;
  pendingCompletion: PendingTurnCompletion | null;
}

function clearPendingTurnCompletion(turn: TurnState): void {
  const pendingCompletion = turn.pendingCompletion;
  if (pendingCompletion?.timeoutId !== null && pendingCompletion !== null) {
    globalThis.clearTimeout(pendingCompletion.timeoutId);
  }
  turn.pendingCompletion = null;
}

async function shouldFinalizePendingTurnCompletion(session: PiAdapterSession): Promise<boolean> {
  const state = await session.process.getState();
  return (
    state.isStreaming === false &&
    state.pendingMessageCount <= 0 &&
    session.latestQueueState.steeringCount <= 0 &&
    session.latestQueueState.followUpCount <= 0 &&
    session.toolStates.size === 0
  );
}

export interface PiSessionRuntimeController {
  getRuntimeState(threadId: ThreadId): Promise<PiRpcSessionState>;
  getSessionStats(threadId: ThreadId): Promise<PiRpcSessionStats>;
  updateRuntimeSettings(input: {
    readonly threadId: ThreadId;
    readonly steeringMode?: "all" | "one-at-a-time";
    readonly followUpMode?: "all" | "one-at-a-time";
    readonly autoCompactionEnabled?: boolean;
    readonly sessionName?: string | null;
  }): Promise<PiRpcSessionState>;
  compact(
    threadId: ThreadId,
    customInstructions?: string,
  ): Promise<{ summary?: string } | undefined>;
}

let activePiSessionRuntimeController: PiSessionRuntimeController | null = null;

export function getPiSessionRuntimeController(): PiSessionRuntimeController | null {
  return activePiSessionRuntimeController;
}

interface PiAdapterSession {
  readonly threadId: ThreadId;
  readonly cwd: string;
  readonly sessionFile: string;
  readonly runtimeMode: RuntimeMode;
  readonly process: PiRpcProcess;
  readonly createdAt: string;
  updatedAt: string;
  model: string | null;
  thinkingLevel: PiThinkingLevel;
  activeTurn: TurnState | null;
  lastCompletedTurn: Omit<TurnState, "aborted" | "failureMessage" | "pendingCompletion"> | null;
  latestQueueState: {
    steeringCount: number;
    followUpCount: number;
  };
  closing: boolean;
  toolStates: Map<string, ToolLifecycleState>;
  assistantTextByItemId: Map<string, string>;
  reasoningTextByItemId: Map<string, string>;
  pendingUserInputRequests: Map<string, PendingUserInputRequest>;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sessionFileFromResumeCursor(resumeCursor: unknown, fallbackPath: string): string {
  if (resumeCursor && typeof resumeCursor === "object") {
    const candidate = asTrimmedString((resumeCursor as Record<string, unknown>).sessionFile);
    if (candidate) {
      return candidate;
    }
  }
  return fallbackPath;
}

function messageItemIdForAssistant(turnId: TurnId | null, message: PiRpcAssistantMessage): string {
  const base = turnId ? String(turnId) : "detached";
  return `assistant:${base}:${message.timestamp}`;
}

function summarizeUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  const serialized = JSON.stringify(value, null, 2);
  const trimmed = serialized.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mapToolNameToItemType(toolName: string): ToolLifecycleState["itemType"] {
  switch (toolName) {
    case "bash":
      return "command_execution";
    case "edit":
    case "write":
      return "file_change";
    case "read":
    case "find":
    case "grep":
    case "ls":
      return "mcp_tool_call";
    case "image_view":
      return "image_view";
    case "web_search":
      return "web_search";
    default:
      return "mcp_tool_call";
  }
}

function extractCommandFromArgs(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) {
    return undefined;
  }
  return asTrimmedString(args.command) ?? undefined;
}

function detailFromPartialResult(partialResult: unknown): string | undefined {
  return summarizeUnknown(partialResult);
}

function detailFromToolResult(result: unknown): string | undefined {
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (typeof record.output === "string" && record.output.trim().length > 0) {
      return record.output.trim();
    }
    if (typeof record.summary === "string" && record.summary.trim().length > 0) {
      return record.summary.trim();
    }
  }
  return summarizeUnknown(result);
}

function userInputQuestionOptions(labels: ReadonlyArray<string>) {
  return labels.map((label) => ({
    label,
    description: label,
  }));
}

function isProviderAdapterError(
  value: unknown,
): value is
  | ProviderAdapterProcessError
  | ProviderAdapterRequestError
  | ProviderAdapterSessionNotFoundError {
  return (
    Schema.is(ProviderAdapterProcessError)(value) ||
    Schema.is(ProviderAdapterRequestError)(value) ||
    Schema.is(ProviderAdapterSessionNotFoundError)(value)
  );
}

function thinkingLevelFromModelSelection(
  modelSelection: ModelSelection | undefined,
): PiThinkingLevel {
  if (modelSelection?.provider !== "codex") {
    return DEFAULT_THINKING_LEVEL;
  }
  switch (modelSelection.options?.reasoningEffort) {
    case "xhigh":
      return "xhigh";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return DEFAULT_THINKING_LEVEL;
  }
}

function parsePiModelSelection(modelSelection: ModelSelection | undefined): {
  readonly provider: string;
  readonly modelId: string;
  readonly thinkingLevel: PiThinkingLevel;
} | null {
  if (!modelSelection || modelSelection.provider !== "codex") {
    return null;
  }

  const trimmedModel = modelSelection.model.trim();
  if (!trimmedModel || trimmedModel === DEFAULT_MODEL_SLUG) {
    return null;
  }

  const slashIndex = trimmedModel.indexOf("/");
  if (slashIndex <= 0 || slashIndex === trimmedModel.length - 1) {
    return null;
  }

  const provider = trimmedModel.slice(0, slashIndex).trim();
  const modelId = trimmedModel.slice(slashIndex + 1).trim();
  if (!provider || !modelId) {
    return null;
  }

  return {
    provider,
    modelId,
    thinkingLevel: thinkingLevelFromModelSelection(modelSelection),
  };
}

function providerModelLabel(
  state: PiRpcSessionState | undefined,
  fallback: string | null,
): string | null {
  if (state?.model) {
    return `${state.model.provider}/${state.model.id}`;
  }
  return fallback;
}

const toProviderSession = (session: PiAdapterSession): ProviderSession => ({
  provider: PROVIDER,
  status: session.activeTurn ? "running" : "ready",
  runtimeMode: session.runtimeMode,
  cwd: session.cwd,
  ...(session.model ? { model: session.model } : {}),
  threadId: session.threadId,
  resumeCursor: { sessionFile: session.sessionFile },
  ...(session.activeTurn ? { activeTurnId: session.activeTurn.turnId } : {}),
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

export const PiCodexAdapterLive = Layer.effect(
  CodexAdapter,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const serverSettings = yield* ServerSettingsService;
    const services = yield* Effect.services();
    const runPromise = Effect.runPromiseWith(services);
    const eventPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<ProviderRuntimeEvent>(),
      PubSub.shutdown,
    );
    const sessions = new Map<ThreadId, PiAdapterSession>();

    activePiSessionRuntimeController = {
      getRuntimeState: async (threadId) => {
        const session = sessions.get(threadId);
        if (!session) {
          throw new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId });
        }
        return session.process.getState();
      },
      getSessionStats: async (threadId) => {
        const session = sessions.get(threadId);
        if (!session) {
          throw new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId });
        }
        return session.process.getSessionStats();
      },
      updateRuntimeSettings: async (input) => {
        const session = sessions.get(input.threadId);
        if (!session) {
          throw new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId: input.threadId,
          });
        }
        if (input.steeringMode) {
          await session.process.setSteeringMode(input.steeringMode);
        }
        if (input.followUpMode) {
          await session.process.setFollowUpMode(input.followUpMode);
        }
        if (typeof input.autoCompactionEnabled === "boolean") {
          await session.process.setAutoCompaction(input.autoCompactionEnabled);
        }
        if (input.sessionName !== undefined) {
          await session.process.setSessionName(input.sessionName);
        }
        const state = await session.process.getState();
        session.model = providerModelLabel(state, session.model);
        session.thinkingLevel =
          (state.thinkingLevel as PiThinkingLevel | undefined) ?? session.thinkingLevel;
        return state;
      },
      compact: async (threadId, customInstructions) => {
        const session = sessions.get(threadId);
        if (!session) {
          throw new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId });
        }
        return session.process.compact(customInstructions);
      },
    };

    const publish = async (event: ProviderRuntimeEvent): Promise<void> => {
      await runPromise(PubSub.publish(eventPubSub, event));
    };

    const nextRuntimeEvent = (
      session: PiAdapterSession,
      input: Omit<ProviderRuntimeEvent, "eventId" | "provider" | "threadId" | "createdAt">,
    ): ProviderRuntimeEvent => {
      session.updatedAt = new Date().toISOString();
      return {
        eventId: EventId.makeUnsafe(crypto.randomUUID()),
        provider: PROVIDER,
        threadId: session.threadId,
        createdAt: session.updatedAt,
        ...input,
      } as ProviderRuntimeEvent;
    };

    const sessionPathForThread = (threadId: ThreadId): string =>
      Path.join(config.baseDir, PI_SESSION_DIRECTORY, `${threadId}.jsonl`);

    const resolveLauncherConfig = async (): Promise<{
      readonly binaryPath: string;
      readonly enableAutoreason: boolean;
      readonly fullAutonomy: boolean;
      readonly env: NodeJS.ProcessEnv;
    }> => {
      const settings = await runPromise(serverSettings.getSettings);
      return {
        binaryPath: resolvePiLauncherPath(settings.providers.codex.binaryPath),
        enableAutoreason: settings.providers.codex.enableAutoreason,
        fullAutonomy: settings.providers.codex.fullAutonomy,
        env: buildPiLauncherEnv({
          homePath: settings.providers.codex.homePath,
          disableTelemetry: true,
        }),
      };
    };

    const resolveImages = async (
      attachments: ReadonlyArray<ChatAttachment>,
    ): Promise<PiRpcImageContent[]> => {
      const images: PiRpcImageContent[] = [];
      for (const attachment of attachments) {
        const attachmentPath = resolveAttachmentPath({
          attachmentsDir: config.attachmentsDir,
          attachment,
        });
        if (!attachmentPath) {
          continue;
        }
        const bytes = await FS.promises.readFile(attachmentPath);
        images.push({
          type: "image",
          data: bytes.toString("base64"),
          mimeType: attachment.mimeType,
        });
      }
      return images;
    };

    const emitSessionStateChanged = async (
      session: PiAdapterSession,
      state: "starting" | "running" | "waiting" | "ready" | "interrupted" | "stopped" | "error",
      turnId?: TurnId,
      reason?: string,
    ): Promise<void> => {
      await publish(
        nextRuntimeEvent(session, {
          type: "session.state.changed",
          ...(turnId ? { turnId } : {}),
          payload: {
            state,
            ...(reason ? { reason } : {}),
          },
        }),
      );
    };

    const finalizeTurnCompletion = async (session: PiAdapterSession): Promise<void> => {
      const turn = session.activeTurn;
      const pendingCompletion = turn?.pendingCompletion;
      if (!turn || !pendingCompletion) {
        return;
      }

      const canFinalize = await shouldFinalizePendingTurnCompletion(session);
      if (!canFinalize) {
        schedulePendingTurnCompletion(
          session,
          pendingCompletion.state,
          pendingCompletion.errorMessage,
        );
        return;
      }

      clearPendingTurnCompletion(turn);
      session.lastCompletedTurn = {
        turnId: turn.turnId,
        startedAt: turn.startedAt,
        requestedAt: turn.requestedAt,
        requestedModel: turn.requestedModel,
      };
      await publish(
        nextRuntimeEvent(session, {
          type: "turn.completed",
          turnId: turn.turnId,
          payload: {
            state: pendingCompletion.state,
            ...(pendingCompletion.errorMessage
              ? { errorMessage: pendingCompletion.errorMessage }
              : {}),
          },
        }),
      );
      session.activeTurn = null;
      session.toolStates.clear();
      session.assistantTextByItemId.clear();
      session.reasoningTextByItemId.clear();
    };

    const schedulePendingTurnCompletion = (
      session: PiAdapterSession,
      state: "completed" | "failed" | "interrupted" | "cancelled",
      errorMessage?: string,
    ): void => {
      const turn = session.activeTurn;
      if (!turn) {
        return;
      }

      clearPendingTurnCompletion(turn);
      const pendingCompletion: PendingTurnCompletion = {
        state,
        requestedAt: new Date().toISOString(),
        ...(errorMessage ? { errorMessage } : {}),
        timeoutId: null,
      };
      pendingCompletion.timeoutId = globalThis.setTimeout(() => {
        const activeTurn = session.activeTurn;
        if (
          !activeTurn ||
          activeTurn !== turn ||
          activeTurn.pendingCompletion !== pendingCompletion
        ) {
          return;
        }
        void finalizeTurnCompletion(session).catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to finalize pending pi turn completion.";
          void emitRuntimeError(session, message);
        });
      }, PI_TURN_COMPLETION_QUIET_PERIOD_MS);
      turn.pendingCompletion = pendingCompletion;
    };

    const touchPendingTurnCompletion = (session: PiAdapterSession): void => {
      const turn = session.activeTurn;
      const pendingCompletion = turn?.pendingCompletion;
      if (!turn || !pendingCompletion) {
        return;
      }
      schedulePendingTurnCompletion(
        session,
        pendingCompletion.state,
        pendingCompletion.errorMessage,
      );
    };

    const emitTurnCompleted = async (
      session: PiAdapterSession,
      state: "completed" | "failed" | "interrupted" | "cancelled",
      errorMessage?: string,
    ): Promise<void> => {
      if (!session.activeTurn) {
        return;
      }
      schedulePendingTurnCompletion(session, state, errorMessage);
    };

    const emitRuntimeError = async (session: PiAdapterSession, message: string): Promise<void> => {
      await publish(
        nextRuntimeEvent(session, {
          type: "runtime.error",
          turnId: session.activeTurn?.turnId,
          payload: {
            message,
            class: "provider_error",
          },
        }),
      );
    };

    const handleExtensionUiRequest = async (
      session: PiAdapterSession,
      request: PiRpcExtensionUiRequest,
    ): Promise<void> => {
      switch (request.method) {
        case "notify": {
          if (request.notifyType === "error") {
            await emitRuntimeError(session, request.message);
            return;
          }
          await publish(
            nextRuntimeEvent(session, {
              type: "runtime.warning",
              turnId: session.activeTurn?.turnId,
              payload: {
                message: request.message,
              },
            }),
          );
          return;
        }
        case "setStatus":
        case "setWidget":
        case "setTitle":
          return;
        case "set_editor_text": {
          const pending = session.pendingUserInputRequests.get(request.id);
          if (!pending || pending.kind !== "editor") {
            return;
          }
          const nextPending = {
            ...pending,
            prefill: request.text,
          };
          session.pendingUserInputRequests.set(request.id, nextPending);
          await publish(
            nextRuntimeEvent(session, {
              type: "user-input.requested",
              turnId: session.activeTurn?.turnId,
              requestId: RuntimeRequestId.makeUnsafe(request.id),
              payload: {
                responseKind: "editor",
                title: nextPending.title,
                prefill: request.text,
                questions: [
                  {
                    id: nextPending.questionId,
                    header: nextPending.title,
                    question: nextPending.title,
                    options: userInputQuestionOptions(["Edit response"]),
                  },
                ],
              },
            }),
          );
          return;
        }
        case "confirm": {
          const questionId = request.id;
          session.pendingUserInputRequests.set(request.id, {
            kind: "confirm",
            id: request.id,
            questionId,
            confirmLabel: "Confirm",
            cancelLabel: "Cancel",
          });
          await publish(
            nextRuntimeEvent(session, {
              type: "user-input.requested",
              turnId: session.activeTurn?.turnId,
              requestId: RuntimeRequestId.makeUnsafe(request.id),
              payload: {
                questions: [
                  {
                    id: questionId,
                    header: request.title,
                    question: request.message,
                    options: userInputQuestionOptions(["Confirm", "Cancel"]),
                  },
                ],
              },
            }),
          );
          return;
        }
        case "select": {
          const questionId = request.id;
          session.pendingUserInputRequests.set(request.id, {
            kind: "select",
            id: request.id,
            questionId,
            options: request.options,
          });
          await publish(
            nextRuntimeEvent(session, {
              type: "user-input.requested",
              turnId: session.activeTurn?.turnId,
              requestId: RuntimeRequestId.makeUnsafe(request.id),
              payload: {
                questions: [
                  {
                    id: questionId,
                    header: request.title,
                    question: request.title,
                    options: userInputQuestionOptions(request.options),
                  },
                ],
              },
            }),
          );
          return;
        }
        case "input":
        case "editor": {
          const questionId = request.id;
          const pending = {
            kind: request.method,
            id: request.id,
            questionId,
            title: request.title,
            ...(request.method === "input" && request.placeholder
              ? { placeholder: request.placeholder }
              : {}),
            ...(request.method === "editor" && request.prefill !== undefined
              ? { prefill: request.prefill }
              : {}),
          } as const;
          session.pendingUserInputRequests.set(request.id, pending);
          await publish(
            nextRuntimeEvent(session, {
              type: "user-input.requested",
              turnId: session.activeTurn?.turnId,
              requestId: RuntimeRequestId.makeUnsafe(request.id),
              payload: {
                responseKind: request.method,
                title: request.title,
                ...(request.method === "input" && request.placeholder
                  ? { placeholder: request.placeholder }
                  : {}),
                ...(request.method === "editor" && request.prefill !== undefined
                  ? { prefill: request.prefill }
                  : {}),
                questions: [
                  {
                    id: questionId,
                    header: request.title,
                    question: request.title,
                    options: userInputQuestionOptions([
                      request.method === "editor" ? "Edit response" : "Provide response",
                    ]),
                  },
                ],
              },
            }),
          );
          return;
        }
      }
    };

    const reviveDetachedTurnIfNeeded = async (
      session: PiAdapterSession,
      event: PiRpcEvent,
    ): Promise<void> => {
      if (
        session.activeTurn ||
        !shouldPiTurnCompletionStayOpen(event) ||
        !session.lastCompletedTurn
      ) {
        return;
      }

      session.activeTurn = {
        ...session.lastCompletedTurn,
        aborted: false,
        pendingCompletion: null,
      };
      await emitSessionStateChanged(
        session,
        "running",
        session.activeTurn.turnId,
        "Late provider activity resumed after apparent completion.",
      );
    };

    const handleProcessEvent = async (
      session: PiAdapterSession,
      event: PiRpcEvent,
    ): Promise<void> => {
      await reviveDetachedTurnIfNeeded(session, event);
      if (session.activeTurn?.pendingCompletion && shouldPiTurnCompletionStayOpen(event)) {
        touchPendingTurnCompletion(session);
      }

      switch (event.type) {
        case "extension_ui_request":
          await handleExtensionUiRequest(session, event);
          return;
        case "turn_start":
        case "message_start":
          return;
        case "message_update": {
          if (event.message.role !== "assistant") {
            return;
          }
          const itemId = messageItemIdForAssistant(
            session.activeTurn?.turnId ?? null,
            event.message,
          );

          const currentThinking = extractAssistantThinking(event.message);
          const previousThinking = session.reasoningTextByItemId.get(itemId) ?? "";
          if (currentThinking.length > 0 && currentThinking !== previousThinking) {
            const thinkingDelta = currentThinking.startsWith(previousThinking)
              ? currentThinking.slice(previousThinking.length)
              : currentThinking;
            session.reasoningTextByItemId.set(itemId, currentThinking);
            await publish(
              nextRuntimeEvent(session, {
                type: "content.delta",
                turnId: session.activeTurn?.turnId,
                itemId: RuntimeItemId.makeUnsafe(itemId),
                payload: {
                  streamKind: "reasoning_text",
                  delta: thinkingDelta,
                },
              }),
            );
          }

          const currentText = extractAssistantText(event.message);
          const previousText = session.assistantTextByItemId.get(itemId) ?? "";
          if (currentText.length === 0 || currentText === previousText) {
            return;
          }
          const delta = currentText.startsWith(previousText)
            ? currentText.slice(previousText.length)
            : currentText;
          session.assistantTextByItemId.set(itemId, currentText);
          await publish(
            nextRuntimeEvent(session, {
              type: "content.delta",
              turnId: session.activeTurn?.turnId,
              itemId: RuntimeItemId.makeUnsafe(itemId),
              payload: {
                streamKind: "assistant_text",
                delta,
              },
            }),
          );
          return;
        }
        case "message_end": {
          if (event.message.role === "assistant") {
            const itemId = messageItemIdForAssistant(
              session.activeTurn?.turnId ?? null,
              event.message,
            );
            const finalThinking = extractAssistantThinking(event.message);
            const previousThinking = session.reasoningTextByItemId.get(itemId) ?? "";
            if (finalThinking.length > 0 && finalThinking !== previousThinking) {
              const delta = finalThinking.startsWith(previousThinking)
                ? finalThinking.slice(previousThinking.length)
                : finalThinking;
              session.reasoningTextByItemId.set(itemId, finalThinking);
              await publish(
                nextRuntimeEvent(session, {
                  type: "content.delta",
                  turnId: session.activeTurn?.turnId,
                  itemId: RuntimeItemId.makeUnsafe(itemId),
                  payload: {
                    streamKind: "reasoning_text",
                    delta,
                  },
                }),
              );
            }
            const finalText = extractAssistantText(event.message);
            const previousText = session.assistantTextByItemId.get(itemId) ?? "";
            if (finalText.length > 0 && finalText !== previousText) {
              const delta = finalText.startsWith(previousText)
                ? finalText.slice(previousText.length)
                : finalText;
              session.assistantTextByItemId.set(itemId, finalText);
              await publish(
                nextRuntimeEvent(session, {
                  type: "content.delta",
                  turnId: session.activeTurn?.turnId,
                  itemId: RuntimeItemId.makeUnsafe(itemId),
                  payload: {
                    streamKind: "assistant_text",
                    delta,
                  },
                }),
              );
            }
            if (event.message.errorMessage) {
              if (session.activeTurn) {
                session.activeTurn.failureMessage = event.message.errorMessage;
              }
            }
            if (finalText.length === 0 && !event.message.errorMessage) {
              return;
            }
            await publish(
              nextRuntimeEvent(session, {
                type: "item.completed",
                turnId: session.activeTurn?.turnId,
                itemId: RuntimeItemId.makeUnsafe(itemId),
                payload: {
                  itemType: "assistant_message",
                  status: event.message.errorMessage ? "failed" : "completed",
                  title: providerModelLabel(undefined, session.model) ?? "Assistant",
                  ...(finalText ? { detail: finalText } : {}),
                },
              }),
            );
            return;
          }

          if (event.message.role === "toolResult") {
            const diff = extractDiffText(event.message.details);
            if (diff && session.activeTurn) {
              await publish(
                nextRuntimeEvent(session, {
                  type: "turn.diff.updated",
                  turnId: session.activeTurn.turnId,
                  payload: {
                    unifiedDiff: diff,
                  },
                }),
              );
            }
            return;
          }

          if (event.message.role === "compactionSummary") {
            await publish(
              nextRuntimeEvent(session, {
                type: "thread.state.changed",
                turnId: session.activeTurn?.turnId,
                payload: {
                  state: "compacted",
                  detail: event.message.summary,
                },
              }),
            );
          }
          return;
        }
        case "tool_execution_start": {
          const runtimeItemId = `tool:${event.toolCallId}`;
          const toolState: ToolLifecycleState = {
            runtimeItemId,
            itemType: mapToolNameToItemType(event.toolName),
            title: event.toolName,
            ...(event.args ? { args: event.args } : {}),
          };
          session.toolStates.set(event.toolCallId, toolState);
          await publish(
            nextRuntimeEvent(session, {
              type: "item.started",
              turnId: session.activeTurn?.turnId,
              itemId: RuntimeItemId.makeUnsafe(runtimeItemId),
              payload: {
                itemType: toolState.itemType,
                status: "inProgress",
                title: toolState.title,
                ...(extractCommandFromArgs(event.args)
                  ? { detail: extractCommandFromArgs(event.args) }
                  : {}),
                data: {
                  item: {
                    input: event.args,
                  },
                  ...(extractCommandFromArgs(event.args)
                    ? { command: extractCommandFromArgs(event.args) }
                    : {}),
                },
              },
            }),
          );
          return;
        }
        case "tool_execution_update": {
          const toolState = session.toolStates.get(event.toolCallId);
          if (!toolState) {
            return;
          }
          const detail = detailFromPartialResult(event.partialResult);
          await publish(
            nextRuntimeEvent(session, {
              type: "item.updated",
              turnId: session.activeTurn?.turnId,
              itemId: RuntimeItemId.makeUnsafe(toolState.runtimeItemId),
              payload: {
                itemType: toolState.itemType,
                status: "inProgress",
                title: toolState.title,
                ...(detail ? { detail } : {}),
                data: {
                  item: {
                    input: toolState.args,
                    partialResult: event.partialResult,
                  },
                  ...(extractCommandFromArgs(toolState.args)
                    ? { command: extractCommandFromArgs(toolState.args) }
                    : {}),
                },
              },
            }),
          );
          return;
        }
        case "tool_execution_end": {
          const toolState = session.toolStates.get(event.toolCallId);
          if (!toolState) {
            return;
          }
          const detail = detailFromToolResult(event.result);
          await publish(
            nextRuntimeEvent(session, {
              type: "item.completed",
              turnId: session.activeTurn?.turnId,
              itemId: RuntimeItemId.makeUnsafe(toolState.runtimeItemId),
              payload: {
                itemType: toolState.itemType,
                status: event.isError ? "failed" : "completed",
                title: toolState.title,
                ...(detail ? { detail } : {}),
                data: {
                  item: {
                    input: toolState.args,
                    result: event.result,
                  },
                  ...(extractCommandFromArgs(toolState.args)
                    ? { command: extractCommandFromArgs(toolState.args) }
                    : {}),
                },
              },
            }),
          );
          session.toolStates.delete(event.toolCallId);
          return;
        }
        case "compaction_start":
          await publish(
            nextRuntimeEvent(session, {
              type: "runtime.warning",
              turnId: session.activeTurn?.turnId,
              payload: {
                message: "Compaction started.",
                detail: event.reason,
              },
            }),
          );
          return;
        case "compaction_end":
          if (event.errorMessage) {
            await emitRuntimeError(session, event.errorMessage);
            return;
          }
          if (!event.aborted) {
            await publish(
              nextRuntimeEvent(session, {
                type: "thread.state.changed",
                turnId: session.activeTurn?.turnId,
                payload: {
                  state: "compacted",
                  detail: event.reason,
                },
              }),
            );
          }
          return;
        case "auto_retry_start":
          await publish(
            nextRuntimeEvent(session, {
              type: "runtime.warning",
              turnId: session.activeTurn?.turnId,
              payload: {
                message: event.errorMessage ?? "Retrying request.",
                detail: event.delayMs,
              },
            }),
          );
          return;
        case "auto_retry_end":
          if (event.success === false) {
            await emitRuntimeError(session, event.finalError ?? "Retry failed.");
          }
          return;
        case "agent_start":
          return;
        case "turn_end":
        case "agent_end": {
          if (!isPiTurnCompletionTerminalEvent(event)) {
            return;
          }
          const failureMessage = session.activeTurn?.failureMessage;
          const nextState = session.activeTurn?.aborted
            ? "interrupted"
            : failureMessage
              ? "failed"
              : "completed";
          await emitTurnCompleted(session, nextState, failureMessage);
          return;
        }
        case "queue_update":
          session.latestQueueState = {
            steeringCount: event.steering.length,
            followUpCount: event.followUp.length,
          };
          return;
      }
    };

    const createSession = async (input: {
      readonly threadId: ThreadId;
      readonly cwd: string;
      readonly sessionFile: string;
      readonly runtimeMode: RuntimeMode;
      readonly modelSelection?: ModelSelection;
    }): Promise<PiAdapterSession> => {
      const launcherConfig = await resolveLauncherConfig();
      const process = await PiRpcProcess.start({
        binaryPath: launcherConfig.binaryPath,
        enableAutoreason: launcherConfig.enableAutoreason,
        fullAutonomy: launcherConfig.fullAutonomy,
        cwd: input.cwd,
        sessionFile: input.sessionFile,
        env: launcherConfig.env,
        onEvent: (event) => {
          const session = sessions.get(input.threadId);
          if (!session) {
            return;
          }
          void handleProcessEvent(session, event).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Unknown pi event error.";
            void emitRuntimeError(session, message);
          });
        },
        onExit: ({ code, signal, stderr }) => {
          const session = sessions.get(input.threadId);
          if (!session) {
            return;
          }
          sessions.delete(input.threadId);
          const exitDetail =
            stderr.trim() || `pi RPC exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
          void (async () => {
            if (session.activeTurn) {
              clearPendingTurnCompletion(session.activeTurn);
              await finalizeTurnCompletion(session).catch(() => undefined);
              if (session.activeTurn) {
                await publish(
                  nextRuntimeEvent(session, {
                    type: "turn.completed",
                    turnId: session.activeTurn.turnId,
                    payload: {
                      state: session.activeTurn.aborted ? "interrupted" : "failed",
                      errorMessage: session.activeTurn.failureMessage ?? exitDetail,
                    },
                  }),
                );
                session.activeTurn = null;
                session.toolStates.clear();
                session.assistantTextByItemId.clear();
                session.reasoningTextByItemId.clear();
              }
            }
            if (!session.closing) {
              await emitRuntimeError(session, exitDetail);
            }
            await publish(
              nextRuntimeEvent(session, {
                type: "session.exited",
                payload: {
                  ...(session.closing
                    ? { exitKind: "graceful" as const }
                    : { exitKind: "error" as const }),
                  reason: exitDetail,
                  recoverable: !session.closing,
                },
              }),
            );
          })().catch(() => undefined);
        },
      });

      const piModelSelection = parsePiModelSelection(input.modelSelection);
      if (piModelSelection) {
        await process.setModel(piModelSelection.provider, piModelSelection.modelId);
        await process.setThinkingLevel(piModelSelection.thinkingLevel);
      }
      const state = await process.getState();
      const session: PiAdapterSession = {
        threadId: input.threadId,
        cwd: input.cwd,
        sessionFile: state.sessionFile ?? input.sessionFile,
        runtimeMode: input.runtimeMode,
        process,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        model: providerModelLabel(
          state,
          piModelSelection ? `${piModelSelection.provider}/${piModelSelection.modelId}` : null,
        ),
        thinkingLevel:
          (state.thinkingLevel as PiThinkingLevel | undefined) ?? DEFAULT_THINKING_LEVEL,
        activeTurn: null,
        lastCompletedTurn: null,
        latestQueueState: {
          steeringCount: 0,
          followUpCount: 0,
        },
        closing: false,
        toolStates: new Map(),
        assistantTextByItemId: new Map(),
        reasoningTextByItemId: new Map(),
        pendingUserInputRequests: new Map(),
      };
      sessions.set(input.threadId, session);

      await publish(
        nextRuntimeEvent(session, {
          type: "session.started",
          payload: {
            message: "pi RPC session started",
            resume: { sessionFile: session.sessionFile },
          },
        }),
      );
      await publish(
        nextRuntimeEvent(session, {
          type: "thread.started",
          payload: {
            providerThreadId: state.sessionId,
          },
        }),
      );
      return session;
    };

    const getSessionOrFail = (threadId: ThreadId): PiAdapterSession => {
      const session = sessions.get(threadId);
      if (!session) {
        throw new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId });
      }
      return session;
    };

    const startSession: CodexAdapterShape["startSession"] = (input) =>
      Effect.tryPromise({
        try: async () => {
          const existing = sessions.get(input.threadId);
          if (existing) {
            return toProviderSession(existing);
          }
          const sessionFile = sessionFileFromResumeCursor(
            input.resumeCursor,
            sessionPathForThread(input.threadId),
          );
          const session = await createSession({
            threadId: input.threadId,
            cwd: input.cwd ?? config.cwd,
            sessionFile,
            runtimeMode: input.runtimeMode,
            ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
          });
          return toProviderSession(session);
        },
        catch: (cause) =>
          isProviderAdapterError(cause)
            ? cause
            : new ProviderAdapterProcessError({
                provider: PROVIDER,
                threadId: input.threadId,
                detail: cause instanceof Error ? cause.message : "Failed to start pi RPC session.",
                cause,
              }),
      });

    const sendTurn: CodexAdapterShape["sendTurn"] = (input) =>
      Effect.tryPromise({
        try: async () => {
          const session = getSessionOrFail(input.threadId);
          const images = input.attachments ? await resolveImages(input.attachments) : [];
          const text =
            (input.input?.trim().length ?? 0) > 0
              ? input.input!.trim()
              : images.length > 0
                ? "Please analyze the attached image(s)."
                : "";

          if (session.activeTurn) {
            if (!input.streamingBehavior) {
              throw new ProviderAdapterRequestError({
                provider: PROVIDER,
                method: "sendTurn",
                detail: `Thread '${input.threadId}' already has a running turn.`,
              });
            }

            await session.process.prompt({
              message: text,
              ...(images.length > 0 ? { images } : {}),
              streamingBehavior: input.streamingBehavior,
            });
            session.updatedAt = new Date().toISOString();
            return {
              threadId: input.threadId,
              turnId: session.activeTurn.turnId,
              resumeCursor: { sessionFile: session.sessionFile },
            } satisfies ProviderTurnStartResult;
          }

          const turnId = TurnId.makeUnsafe(crypto.randomUUID());
          const modelSelection = parsePiModelSelection(input.modelSelection);
          if (modelSelection) {
            await session.process.setModel(modelSelection.provider, modelSelection.modelId);
            await session.process.setThinkingLevel(modelSelection.thinkingLevel);
            session.model = `${modelSelection.provider}/${modelSelection.modelId}`;
            session.thinkingLevel = modelSelection.thinkingLevel;
          }

          session.lastCompletedTurn = null;
          session.activeTurn = {
            turnId,
            requestedAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            requestedModel: session.model,
            aborted: false,
            pendingCompletion: null,
          };
          session.toolStates.clear();
          session.assistantTextByItemId.clear();
          session.reasoningTextByItemId.clear();
          await publish(
            nextRuntimeEvent(session, {
              type: "turn.started",
              turnId,
              payload: {
                ...(session.model ? { model: session.model } : {}),
                effort: session.thinkingLevel,
              },
            }),
          );

          await session.process.prompt({
            message: text,
            ...(images.length > 0 ? { images } : {}),
          });
          session.updatedAt = new Date().toISOString();
          return {
            threadId: input.threadId,
            turnId,
            resumeCursor: { sessionFile: session.sessionFile },
          } satisfies ProviderTurnStartResult;
        },
        catch: (cause) =>
          isProviderAdapterError(cause)
            ? cause
            : new ProviderAdapterRequestError({
                provider: PROVIDER,
                method: "sendTurn",
                detail: cause instanceof Error ? cause.message : "Failed to send prompt to pi.",
                cause,
              }),
      }).pipe(
        Effect.tapError((error) =>
          Effect.promise(async () => {
            const session = sessions.get(input.threadId);
            if (!session?.activeTurn) {
              return;
            }
            const failureMessage = error.message;
            session.activeTurn.failureMessage = failureMessage;
            clearPendingTurnCompletion(session.activeTurn);
            await emitRuntimeError(session, failureMessage);
            await publish(
              nextRuntimeEvent(session, {
                type: "turn.completed",
                turnId: session.activeTurn.turnId,
                payload: {
                  state: "failed",
                  errorMessage: failureMessage,
                },
              }),
            );
            session.activeTurn = null;
            session.toolStates.clear();
            session.assistantTextByItemId.clear();
            session.reasoningTextByItemId.clear();
          }),
        ),
      );

    const interruptTurn: CodexAdapterShape["interruptTurn"] = (threadId) =>
      Effect.tryPromise({
        try: async () => {
          const session = getSessionOrFail(threadId);
          if (!session.activeTurn) {
            return;
          }
          session.activeTurn.aborted = true;
          await session.process.abort();
        },
        catch: (cause) =>
          isProviderAdapterError(cause)
            ? cause
            : new ProviderAdapterRequestError({
                provider: PROVIDER,
                method: "interruptTurn",
                detail: cause instanceof Error ? cause.message : "Failed to interrupt pi turn.",
                cause,
              }),
      });

    const readThread: CodexAdapterShape["readThread"] = (threadId) =>
      Effect.sync(() => {
        const session = getSessionOrFail(threadId);
        return {
          threadId,
          turns: session.activeTurn ? [{ id: session.activeTurn.turnId, items: [] }] : [],
        };
      });

    const rollbackThread: CodexAdapterShape["rollbackThread"] = (threadId) =>
      Effect.fail(
        new ProviderAdapterRequestError({
          provider: PROVIDER,
          method: "rollbackThread",
          detail: `Rollback is not supported for pi-backed thread '${threadId}'.`,
        }),
      );

    const respondToRequest: CodexAdapterShape["respondToRequest"] = (threadId, requestId) =>
      Effect.fail(
        new ProviderAdapterRequestError({
          provider: PROVIDER,
          method: "respondToRequest",
          detail: `Approval requests are not supported for pi-backed thread '${threadId}' (${requestId}).`,
        }),
      );

    const respondToUserInput: CodexAdapterShape["respondToUserInput"] = (
      threadId,
      requestId,
      answers,
    ) =>
      Effect.tryPromise({
        try: async () => {
          const session = getSessionOrFail(threadId);
          const pending = session.pendingUserInputRequests.get(requestId);
          if (!pending) {
            throw new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "respondToUserInput",
              detail: `Unknown pending user-input request '${requestId}'.`,
            });
          }
          const answer = asTrimmedString(answers[pending.questionId]);
          if (!answer) {
            throw new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "respondToUserInput",
              detail: `Missing answer for user-input request '${requestId}'.`,
            });
          }

          switch (pending.kind) {
            case "confirm": {
              const normalized = answer.toLowerCase();
              const confirmed =
                normalized === pending.confirmLabel.toLowerCase() ||
                normalized === "yes" ||
                normalized === "true";
              await session.process.sendExtensionUiResponse({
                type: "extension_ui_response",
                id: requestId,
                confirmed,
              });
              break;
            }
            case "select":
            case "input":
            case "editor": {
              await session.process.sendExtensionUiResponse({
                type: "extension_ui_response",
                id: requestId,
                value: answer,
              });
              break;
            }
          }

          session.pendingUserInputRequests.delete(requestId);
          await publish(
            nextRuntimeEvent(session, {
              type: "user-input.resolved",
              turnId: session.activeTurn?.turnId,
              requestId: RuntimeRequestId.makeUnsafe(requestId),
              payload: {
                answers,
              },
            }),
          );
        },
        catch: (cause) =>
          isProviderAdapterError(cause)
            ? cause
            : new ProviderAdapterRequestError({
                provider: PROVIDER,
                method: "respondToUserInput",
                detail:
                  cause instanceof Error ? cause.message : "Failed to respond to pi user input.",
                cause,
              }),
      });

    const stopSession: CodexAdapterShape["stopSession"] = (threadId) =>
      Effect.tryPromise({
        try: async () => {
          const session = getSessionOrFail(threadId);
          session.closing = true;
          if (session.activeTurn) {
            clearPendingTurnCompletion(session.activeTurn);
            session.activeTurn.aborted = true;
            await session.process.abort().catch(() => undefined);
          }
          await session.process.close();
          sessions.delete(threadId);
        },
        catch: (cause) =>
          isProviderAdapterError(cause)
            ? cause
            : new ProviderAdapterProcessError({
                provider: PROVIDER,
                threadId,
                detail: cause instanceof Error ? cause.message : "Failed to stop pi session.",
                cause,
              }),
      });

    const listSessions: CodexAdapterShape["listSessions"] = () =>
      Effect.sync(() => Array.from(sessions.values()).map((session) => toProviderSession(session)));

    const hasSession: CodexAdapterShape["hasSession"] = (threadId) =>
      Effect.sync(() => sessions.has(threadId));

    const stopAll: CodexAdapterShape["stopAll"] = () =>
      Effect.tryPromise({
        try: async () => {
          for (const threadId of Array.from(sessions.keys())) {
            const session = sessions.get(threadId);
            if (!session) {
              continue;
            }
            session.closing = true;
            if (session.activeTurn) {
              clearPendingTurnCompletion(session.activeTurn);
              session.activeTurn.aborted = true;
              await session.process.abort().catch(() => undefined);
            }
            await session.process.close().catch(() => undefined);
            sessions.delete(threadId);
          }
        },
        catch: (cause) =>
          new ProviderAdapterProcessError({
            provider: PROVIDER,
            threadId: "stop-all",
            detail: cause instanceof Error ? cause.message : "Failed to stop pi sessions.",
            cause,
          }),
      });

    return {
      provider: PROVIDER,
      capabilities: {
        sessionModelSwitch: "in-session",
      },
      startSession,
      sendTurn,
      interruptTurn,
      respondToRequest,
      respondToUserInput,
      stopSession,
      listSessions,
      hasSession,
      readThread,
      rollbackThread,
      stopAll,
      get streamEvents() {
        return Stream.fromPubSub(eventPubSub);
      },
    } satisfies CodexAdapterShape;
  }),
);
