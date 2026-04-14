import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useCommandPaletteStore } from "../commandPaletteStore";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { appendTerminalContextsToPrompt } from "../lib/terminalContext";
import { isTerminalFocused } from "../lib/terminalFocus";
import { readNativeApi } from "../nativeApi";
import {
  cloneComposerImageForRetry,
  readFileAsDataUrl,
  revokeBlobPreviewUrl,
} from "../components/ChatView.logic";
import { resolveShortcutCommand } from "../keybindings";
import { newCommandId, newMessageId } from "../lib/utils";
import { derivePendingApprovals, derivePendingUserInputs } from "../session-logic";
import { useStore } from "../store";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { useComposerDraftStore } from "~/composerDraftStore";
import { resolveSidebarNewThreadEnvMode } from "~/components/Sidebar.logic";
import { useSettings } from "~/hooks/useSettings";
import { useQueuedFollowUpStore } from "~/queuedFollowUpStore";
import { useServerKeybindings } from "~/rpc/serverState";

function ChatRouteGlobalShortcuts() {
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const selectedThreadIdsSize = useThreadSelectionStore((state) => state.selectedThreadIds.size);
  const { activeDraftThread, activeThread, defaultProjectId, handleNewThread, routeThreadId } =
    useHandleNewThread();
  const keybindings = useServerKeybindings();
  const terminalOpen = useTerminalStateStore((state) =>
    routeThreadId
      ? selectThreadTerminalState(state.terminalStateByThreadId, routeThreadId).terminalOpen
      : false,
  );
  const appSettings = useSettings();

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (useCommandPaletteStore.getState().open) {
        return;
      }

      if (event.key === "Escape" && selectedThreadIdsSize > 0) {
        event.preventDefault();
        clearSelection();
        return;
      }

      const projectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? defaultProjectId;
      if (!projectId) return;

      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
        },
      });

      if (command === "chat.newLocal") {
        event.preventDefault();
        event.stopPropagation();
        void handleNewThread(projectId, {
          envMode: resolveSidebarNewThreadEnvMode({
            defaultEnvMode: appSettings.defaultThreadEnvMode,
          }),
        });
        return;
      }

      if (command === "chat.new") {
        event.preventDefault();
        event.stopPropagation();
        void handleNewThread(projectId, {
          branch: activeThread?.branch ?? activeDraftThread?.branch ?? null,
          worktreePath: activeThread?.worktreePath ?? activeDraftThread?.worktreePath ?? null,
          envMode:
            activeDraftThread?.envMode ?? (activeThread?.worktreePath ? "worktree" : "local"),
        });
        return;
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    activeDraftThread,
    activeThread,
    clearSelection,
    handleNewThread,
    keybindings,
    defaultProjectId,
    selectedThreadIdsSize,
    terminalOpen,
    appSettings.defaultThreadEnvMode,
  ]);

  return null;
}

function InactiveQueuedFollowUpDispatcher() {
  const { routeThreadId } = useHandleNewThread();
  const threads = useStore((state) => state.threads);
  const setThreadError = useStore((state) => state.setError);
  const queuedByThreadId = useQueuedFollowUpStore((state) => state.queuedByThreadId);
  const removeQueuedFollowUp = useQueuedFollowUpStore((state) => state.remove);
  const dispatchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (dispatchKeyRef.current) {
      return;
    }

    const nextThread = threads.find((thread) => {
      if (thread.id === routeThreadId) {
        return false;
      }
      const queue = queuedByThreadId[thread.id] ?? [];
      if (queue.length === 0) {
        return false;
      }
      if (
        thread.session?.activeTurnId != null ||
        thread.session?.orchestrationStatus === "running"
      ) {
        return false;
      }
      if (derivePendingApprovals(thread.activities).length > 0) {
        return false;
      }
      if (derivePendingUserInputs(thread.activities).length > 0) {
        return false;
      }
      return true;
    });
    if (!nextThread) {
      return;
    }

    const draft = queuedByThreadId[nextThread.id]?.[0];
    if (!draft) {
      return;
    }

    const dispatchKey = `${nextThread.id}:${draft.id}`;
    dispatchKeyRef.current = dispatchKey;

    void (async () => {
      const api = readNativeApi();
      if (!api) {
        return;
      }

      const messageCreatedAt = new Date().toISOString();
      const messageText = appendTerminalContextsToPrompt(draft.prompt, draft.terminalContexts);

      try {
        if (
          draft.modelSelection.model !== nextThread.modelSelection.model ||
          draft.modelSelection.provider !== nextThread.modelSelection.provider ||
          JSON.stringify(draft.modelSelection.options ?? null) !==
            JSON.stringify(nextThread.modelSelection.options ?? null)
        ) {
          await api.orchestration.dispatchCommand({
            type: "thread.meta.update",
            commandId: newCommandId(),
            threadId: nextThread.id,
            modelSelection: draft.modelSelection,
          });
        }

        if (draft.runtimeMode !== nextThread.runtimeMode) {
          await api.orchestration.dispatchCommand({
            type: "thread.runtime-mode.set",
            commandId: newCommandId(),
            threadId: nextThread.id,
            runtimeMode: draft.runtimeMode,
            createdAt: messageCreatedAt,
          });
        }

        if (draft.interactionMode !== nextThread.interactionMode) {
          await api.orchestration.dispatchCommand({
            type: "thread.interaction-mode.set",
            commandId: newCommandId(),
            threadId: nextThread.id,
            interactionMode: draft.interactionMode,
            createdAt: messageCreatedAt,
          });
        }

        const attachments = await Promise.all(
          draft.images.map(async (image) => ({
            type: "image" as const,
            name: image.name,
            mimeType: image.mimeType,
            sizeBytes: image.sizeBytes,
            dataUrl: await readFileAsDataUrl(image.file),
          })),
        );

        await api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: nextThread.id,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: messageText,
            attachments,
          },
          modelSelection: draft.modelSelection,
          titleSeed: nextThread.title,
          runtimeMode: draft.runtimeMode,
          interactionMode: draft.interactionMode,
          createdAt: messageCreatedAt,
        });

        const removedDraft = removeQueuedFollowUp(nextThread.id, draft.id);
        if (removedDraft) {
          for (const image of removedDraft.images) {
            revokeBlobPreviewUrl(image.previewUrl);
          }
        }
      } catch (error) {
        const composerDraftStore = useComposerDraftStore.getState();
        composerDraftStore.clearComposerContent(nextThread.id);
        composerDraftStore.setPrompt(nextThread.id, draft.prompt);
        composerDraftStore.addImages(nextThread.id, draft.images.map(cloneComposerImageForRetry));
        composerDraftStore.addTerminalContexts(nextThread.id, draft.terminalContexts);
        removeQueuedFollowUp(nextThread.id, draft.id);
        setThreadError(
          nextThread.id,
          error instanceof Error ? error.message : "Failed to send queued follow-up.",
        );
      } finally {
        if (dispatchKeyRef.current === dispatchKey) {
          dispatchKeyRef.current = null;
        }
      }
    })();
  }, [queuedByThreadId, removeQueuedFollowUp, routeThreadId, setThreadError, threads]);

  return null;
}

function ChatRouteLayout() {
  return (
    <>
      <ChatRouteGlobalShortcuts />
      <InactiveQueuedFollowUpDispatcher />
      <Outlet />
    </>
  );
}

export const Route = createFileRoute("/_chat")({
  component: ChatRouteLayout,
});
