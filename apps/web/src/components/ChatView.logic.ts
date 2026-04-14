import { ProjectId, type ModelSelection, type ThreadId, type TurnId } from "@t3tools/contracts";
import { truncate } from "@t3tools/shared/String";
import { type ChatMessage, type SessionPhase, type Thread, type ThreadSession } from "../types";
import { randomUUID } from "~/lib/utils";
import { type ComposerImageAttachment, type DraftThreadState } from "../composerDraftStore";
import { Schema } from "effect";
import { useStore } from "../store";
import {
  filterTerminalContextsWithText,
  stripInlineTerminalContextPlaceholders,
  type TerminalContextDraft,
} from "../lib/terminalContext";

export const LAST_INVOKED_SCRIPT_BY_PROJECT_KEY = "t3code:last-invoked-script-by-project";
export const MAX_HIDDEN_MOUNTED_TERMINAL_THREADS = 10;
const WORKTREE_BRANCH_PREFIX = "t3code";

export const LastInvokedScriptByProjectSchema = Schema.Record(ProjectId, Schema.String);

export function buildLocalDraftThread(
  threadId: ThreadId,
  draftThread: DraftThreadState,
  fallbackModelSelection: ModelSelection,
  error: string | null,
): Thread {
  return {
    id: threadId,
    codexThreadId: null,
    projectId: draftThread.projectId,
    title: "New thread",
    modelSelection: fallbackModelSelection,
    runtimeMode: draftThread.runtimeMode,
    interactionMode: draftThread.interactionMode,
    session: null,
    messages: [],
    error,
    createdAt: draftThread.createdAt,
    archivedAt: null,
    latestTurn: null,
    branch: draftThread.branch,
    worktreePath: draftThread.worktreePath,
    turnDiffSummaries: [],
    activities: [],
    proposedPlans: [],
  };
}

export function reconcileMountedTerminalThreadIds(input: {
  currentThreadIds: ReadonlyArray<ThreadId>;
  openThreadIds: ReadonlyArray<ThreadId>;
  activeThreadId: ThreadId | null;
  activeThreadTerminalOpen: boolean;
  maxHiddenThreadCount?: number;
}): ThreadId[] {
  const openThreadIdSet = new Set(input.openThreadIds);
  const hiddenThreadIds = input.currentThreadIds.filter(
    (threadId) => threadId !== input.activeThreadId && openThreadIdSet.has(threadId),
  );
  const maxHiddenThreadCount = Math.max(
    0,
    input.maxHiddenThreadCount ?? MAX_HIDDEN_MOUNTED_TERMINAL_THREADS,
  );
  const nextThreadIds =
    hiddenThreadIds.length > maxHiddenThreadCount
      ? hiddenThreadIds.slice(-maxHiddenThreadCount)
      : hiddenThreadIds;

  if (
    input.activeThreadId &&
    input.activeThreadTerminalOpen &&
    !nextThreadIds.includes(input.activeThreadId)
  ) {
    nextThreadIds.push(input.activeThreadId);
  }

  return nextThreadIds;
}

export function revokeBlobPreviewUrl(previewUrl: string | undefined): void {
  if (!previewUrl || typeof URL === "undefined" || !previewUrl.startsWith("blob:")) {
    return;
  }
  URL.revokeObjectURL(previewUrl);
}

export function revokeUserMessagePreviewUrls(message: ChatMessage): void {
  if (message.role !== "user" || !message.attachments) {
    return;
  }
  for (const attachment of message.attachments) {
    if (attachment.type !== "image") {
      continue;
    }
    revokeBlobPreviewUrl(attachment.previewUrl);
  }
}

export function collectUserMessageBlobPreviewUrls(message: ChatMessage): string[] {
  if (message.role !== "user" || !message.attachments) {
    return [];
  }
  const previewUrls: string[] = [];
  for (const attachment of message.attachments) {
    if (attachment.type !== "image") continue;
    if (!attachment.previewUrl || !attachment.previewUrl.startsWith("blob:")) continue;
    previewUrls.push(attachment.previewUrl);
  }
  return previewUrls;
}

export interface PullRequestDialogState {
  initialReference: string | null;
  key: number;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image data."));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read image."));
    });
    reader.readAsDataURL(file);
  });
}

export function buildTemporaryWorktreeBranchName(): string {
  // Keep the 8-hex suffix shape for backend temporary-branch detection.
  const token = randomUUID().slice(0, 8).toLowerCase();
  return `${WORKTREE_BRANCH_PREFIX}/${token}`;
}

export function cloneComposerImageForRetry(
  image: ComposerImageAttachment,
): ComposerImageAttachment {
  if (typeof URL === "undefined" || !image.previewUrl.startsWith("blob:")) {
    return image;
  }
  try {
    return {
      ...image,
      previewUrl: URL.createObjectURL(image.file),
    };
  } catch {
    return image;
  }
}

export function deriveComposerSendState(options: {
  prompt: string;
  imageCount: number;
  terminalContexts: ReadonlyArray<TerminalContextDraft>;
}): {
  trimmedPrompt: string;
  sendableTerminalContexts: TerminalContextDraft[];
  expiredTerminalContextCount: number;
  hasSendableContent: boolean;
} {
  const trimmedPrompt = stripInlineTerminalContextPlaceholders(options.prompt).trim();
  const sendableTerminalContexts = filterTerminalContextsWithText(options.terminalContexts);
  const expiredTerminalContextCount =
    options.terminalContexts.length - sendableTerminalContexts.length;
  return {
    trimmedPrompt,
    sendableTerminalContexts,
    expiredTerminalContextCount,
    hasSendableContent:
      trimmedPrompt.length > 0 || options.imageCount > 0 || sendableTerminalContexts.length > 0,
  };
}

export function replaceQueuedEntryWithDraft<T extends { id: string }>(input: {
  queue: ReadonlyArray<T>;
  draftId: string;
  replacement: T | null;
}): T[] {
  const index = input.queue.findIndex((entry) => entry.id === input.draftId);
  if (index < 0) {
    return [...input.queue];
  }

  const next = input.queue.filter((entry) => entry.id !== input.draftId);
  if (!input.replacement) {
    return next;
  }

  return [...next.slice(0, index), input.replacement, ...next.slice(index)];
}

export function buildExpiredTerminalContextToastCopy(
  expiredTerminalContextCount: number,
  variant: "omitted" | "empty",
): { title: string; description: string } {
  const count = Math.max(1, Math.floor(expiredTerminalContextCount));
  const noun = count === 1 ? "Expired terminal context" : "Expired terminal contexts";
  if (variant === "empty") {
    return {
      title: `${noun} won't be sent`,
      description: "Remove it or re-add it to include terminal output.",
    };
  }
  return {
    title: `${noun} omitted from message`,
    description: "Re-add it if you want that terminal output included.",
  };
}

const FORK_CHAT_MAX_PROMPT_CHARS = 18_000;
const FORK_CHAT_MAX_PLAN_CHARS = 4_000;
const FORK_CHAT_MAX_MESSAGE_CHARS = 900;
const FORK_CHAT_TRANSCRIPT_HEAD_COUNT = 2;
const FORK_CHAT_TRANSCRIPT_TAIL_COUNT = 8;

function compactWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clipForkSection(value: string, maxChars: number): string {
  const normalized = compactWhitespace(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${truncate(normalized, maxChars - 1).trimEnd()}…`;
}

function formatForkAttachmentSummary(message: ChatMessage): string {
  if (!message.attachments || message.attachments.length === 0) {
    return "";
  }

  const attachmentSummary = message.attachments
    .map((attachment) => {
      if (attachment.type === "image") {
        return `image:${attachment.name}`;
      }
      return attachment.type;
    })
    .join(", ");

  return `\n[attachments: ${attachmentSummary}]`;
}

function selectForkTranscriptMessages(messages: ReadonlyArray<ChatMessage>): ChatMessage[] {
  if (messages.length <= FORK_CHAT_TRANSCRIPT_HEAD_COUNT + FORK_CHAT_TRANSCRIPT_TAIL_COUNT + 1) {
    return [...messages];
  }

  return [
    ...messages.slice(0, FORK_CHAT_TRANSCRIPT_HEAD_COUNT),
    ...messages.slice(-FORK_CHAT_TRANSCRIPT_TAIL_COUNT),
  ];
}

export function buildForkChatThreadTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length === 0) {
    return "Fork chat";
  }
  return truncate(
    normalized.toLowerCase().endsWith("(fork)") ? normalized : `${normalized} (fork)`,
    80,
  );
}

export function buildForkChatPrompt(
  thread: Pick<
    Thread,
    | "title"
    | "modelSelection"
    | "runtimeMode"
    | "interactionMode"
    | "branch"
    | "worktreePath"
    | "latestTurn"
    | "messages"
    | "proposedPlans"
  >,
): string {
  const selectedMessages = selectForkTranscriptMessages(thread.messages);
  const omittedMessageCount = Math.max(0, thread.messages.length - selectedMessages.length);
  const latestPlan = thread.proposedPlans.at(-1) ?? null;

  const transcriptLines = selectedMessages.map((message, index) => {
    const prefix = `${index + 1}. ${message.role.toUpperCase()}: `;
    return `${prefix}${clipForkSection(message.text, FORK_CHAT_MAX_MESSAGE_CHARS)}${formatForkAttachmentSummary(message)}`;
  });

  if (omittedMessageCount > 0) {
    transcriptLines.splice(
      FORK_CHAT_TRANSCRIPT_HEAD_COUNT,
      0,
      [
        `… omitted ${omittedMessageCount} middle message${omittedMessageCount === 1 ? "" : "s"} to keep this handoff compact …`,
      ].join(""),
    );
  }

  const metadataLines = [
    `- Original title: ${thread.title}`,
    `- Model: ${thread.modelSelection.provider}/${thread.modelSelection.model}`,
    `- Runtime mode: ${thread.runtimeMode}`,
    `- Interaction mode: ${thread.interactionMode}`,
    ...(thread.branch ? [`- Branch: ${thread.branch}`] : []),
    ...(thread.worktreePath ? [`- Worktree: ${thread.worktreePath}`] : []),
    ...(thread.latestTurn
      ? [`- Latest turn: ${thread.latestTurn.state} (requested ${thread.latestTurn.requestedAt})`]
      : []),
  ];

  const sections = [
    "This thread is a fork of an earlier chat. Treat the compact handoff below as the carried-over context from the original thread.",
    "",
    "Please use this context to continue the work without redoing already completed steps. If the handoff is missing something important, say exactly what is missing.",
    "",
    "Do not start new work yet. First, briefly acknowledge that you have the forked context and are ready for the next instruction.",
    "",
    "## Original thread metadata",
    metadataLines.join("\n"),
    latestPlan
      ? [
          "",
          "## Latest proposed plan",
          clipForkSection(latestPlan.planMarkdown, FORK_CHAT_MAX_PLAN_CHARS),
        ].join("\n")
      : "",
    "",
    "## Conversation transcript excerpt",
    transcriptLines.length > 0
      ? transcriptLines.join("\n\n")
      : "(No messages were present in the original thread.)",
  ].filter((section) => section.length > 0);

  return clipForkSection(sections.join("\n"), FORK_CHAT_MAX_PROMPT_CHARS);
}

export function threadHasStarted(thread: Thread | null | undefined): boolean {
  return Boolean(
    thread && (thread.latestTurn !== null || thread.messages.length > 0 || thread.session !== null),
  );
}

export async function waitForStartedServerThread(
  threadId: ThreadId,
  timeoutMs = 1_000,
): Promise<boolean> {
  const getThread = () => useStore.getState().threads.find((thread) => thread.id === threadId);
  const thread = getThread();

  if (threadHasStarted(thread)) {
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const finish = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      unsubscribe();
      resolve(result);
    };

    const unsubscribe = useStore.subscribe((state) => {
      if (!threadHasStarted(state.threads.find((thread) => thread.id === threadId))) {
        return;
      }
      finish(true);
    });

    if (threadHasStarted(getThread())) {
      finish(true);
      return;
    }

    timeoutId = globalThis.setTimeout(() => {
      finish(false);
    }, timeoutMs);
  });
}

export interface LocalDispatchSnapshot {
  startedAt: string;
  preparingWorktree: boolean;
  latestTurnTurnId: TurnId | null;
  latestTurnRequestedAt: string | null;
  latestTurnStartedAt: string | null;
  latestTurnCompletedAt: string | null;
  sessionOrchestrationStatus: ThreadSession["orchestrationStatus"] | null;
  sessionUpdatedAt: string | null;
}

export interface ComposerDispatchStatusCopy {
  title: string;
  description: string;
}

function formatDispatchElapsed(nowMs: number, startedAt: string | null): string | null {
  if (!startedAt) {
    return null;
  }
  const startedAtMs = Date.parse(startedAt);
  if (Number.isNaN(startedAtMs)) {
    return null;
  }
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  if (elapsedSeconds <= 0) {
    return null;
  }
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s elapsed`;
  }
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return seconds === 0 ? `${minutes}m elapsed` : `${minutes}m ${seconds}s elapsed`;
}

export function deriveComposerDispatchStatusCopy(input: {
  isConnecting: boolean;
  isPreparingWorktree: boolean;
  isSendBusy: boolean;
  isServerThread: boolean;
  localDispatchStartedAt: string | null;
  nowMs: number;
  session: Thread["session"] | null | undefined;
}): ComposerDispatchStatusCopy | null {
  if (!input.isConnecting && !input.isSendBusy) {
    return null;
  }

  const elapsed = formatDispatchElapsed(input.nowMs, input.localDispatchStartedAt);
  const suffix = elapsed ? ` · ${elapsed}` : "";

  if (input.isPreparingWorktree) {
    return {
      title: `Preparing worktree${suffix}`,
      description: "Creating an isolated workspace before the first turn starts.",
    };
  }

  if (input.isConnecting || input.session?.status === "connecting") {
    return {
      title: `Connecting to Pi${suffix}`,
      description: "Waiting for the provider session to become ready for this thread.",
    };
  }

  if (!input.isServerThread) {
    return {
      title: `Creating thread${suffix}`,
      description: "Saving the new thread and sending your first message.",
    };
  }

  return {
    title: `Starting turn${suffix}`,
    description: "Waiting for Pi to acknowledge the new turn.",
  };
}

export function createLocalDispatchSnapshot(
  activeThread: Thread | undefined,
  options?: { preparingWorktree?: boolean },
): LocalDispatchSnapshot {
  const latestTurn = activeThread?.latestTurn ?? null;
  const session = activeThread?.session ?? null;
  return {
    startedAt: new Date().toISOString(),
    preparingWorktree: Boolean(options?.preparingWorktree),
    latestTurnTurnId: latestTurn?.turnId ?? null,
    latestTurnRequestedAt: latestTurn?.requestedAt ?? null,
    latestTurnStartedAt: latestTurn?.startedAt ?? null,
    latestTurnCompletedAt: latestTurn?.completedAt ?? null,
    sessionOrchestrationStatus: session?.orchestrationStatus ?? null,
    sessionUpdatedAt: session?.updatedAt ?? null,
  };
}

export function hasServerAcknowledgedLocalDispatch(input: {
  localDispatch: LocalDispatchSnapshot | null;
  phase: SessionPhase;
  latestTurn: Thread["latestTurn"] | null;
  session: Thread["session"] | null;
  hasPendingApproval: boolean;
  hasPendingUserInput: boolean;
  threadError: string | null | undefined;
}): boolean {
  if (!input.localDispatch) {
    return false;
  }
  if (
    input.phase === "running" ||
    input.hasPendingApproval ||
    input.hasPendingUserInput ||
    Boolean(input.threadError)
  ) {
    return true;
  }

  const latestTurn = input.latestTurn ?? null;
  const session = input.session ?? null;

  return (
    input.localDispatch.latestTurnTurnId !== (latestTurn?.turnId ?? null) ||
    input.localDispatch.latestTurnRequestedAt !== (latestTurn?.requestedAt ?? null) ||
    input.localDispatch.latestTurnStartedAt !== (latestTurn?.startedAt ?? null) ||
    input.localDispatch.latestTurnCompletedAt !== (latestTurn?.completedAt ?? null) ||
    input.localDispatch.sessionOrchestrationStatus !== (session?.orchestrationStatus ?? null) ||
    input.localDispatch.sessionUpdatedAt !== (session?.updatedAt ?? null)
  );
}
