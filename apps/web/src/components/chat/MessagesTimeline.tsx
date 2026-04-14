import { FileDiff, Virtualizer } from "@pierre/diffs/react";
import { type MessageId, type TurnId } from "@t3tools/contracts";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  measureElement as measureVirtualElement,
  type VirtualItem,
  useVirtualizer,
} from "@tanstack/react-virtual";
import {
  deriveTimelineEntries,
  formatDuration,
  formatElapsed,
  type WorkLogEntry,
} from "../../session-logic";
import { AUTO_SCROLL_BOTTOM_THRESHOLD_PX } from "../../chat-scroll";
import { type TurnDiffSummary } from "../../types";
import { summarizeTurnDiffStats } from "../../lib/turnDiffTree";
import ChatMarkdown from "../ChatMarkdown";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  EyeIcon,
  GlobeIcon,
  HammerIcon,
  type LucideIcon,
  SquarePenIcon,
  TerminalIcon,
  Undo2Icon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { clamp } from "effect/Number";
import { buildExpandedImagePreview, ExpandedImagePreview } from "./ExpandedImagePreview";
import { ProposedPlanCard } from "./ProposedPlanCard";
import { ChangedFilesTree } from "./ChangedFilesTree";
import { DiffStatLabel, hasNonZeroStat } from "./DiffStatLabel";
import { MessageCopyButton } from "./MessageCopyButton";
import {
  MAX_VISIBLE_WORK_LOG_ENTRIES,
  deriveMessagesTimelineRows,
  estimateMessagesTimelineRowHeight,
  normalizeCompactToolLabel,
  type MessagesTimelineRow,
} from "./MessagesTimeline.logic";
import { TerminalContextInlineChip } from "./TerminalContextInlineChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  deriveDisplayedUserMessageState,
  type ParsedTerminalContextEntry,
} from "~/lib/terminalContext";
import { cn } from "~/lib/utils";
import {
  buildFileDiffRenderKey,
  DIFF_RENDER_UNSAFE_CSS,
  getRenderablePatch,
  resolveDiffThemeName,
  resolveFileDiffPath,
} from "~/lib/diffRendering";
import { type TimestampFormat } from "@t3tools/contracts/settings";
import { formatTimestamp } from "../../timestampFormat";
import {
  buildInlineTerminalContextText,
  formatInlineTerminalContextLabel,
  textContainsInlineTerminalContextLabels,
} from "./userMessageTerminalContexts";
import {
  mergeSubagentInvocations,
  type SubagentInvocation,
  type SubagentResultSummary,
} from "../../subagentActivity";
import { Dialog, DialogDescription, DialogHeader, DialogPopup, DialogTitle } from "../ui/dialog";

const ALWAYS_UNVIRTUALIZED_TAIL_ROWS = 8;

interface MessagesTimelineProps {
  hasMessages: boolean;
  isWorking: boolean;
  activeTurnInProgress: boolean;
  activeTurnStartedAt: string | null;
  scrollContainer: HTMLDivElement | null;
  timelineEntries: ReturnType<typeof deriveTimelineEntries>;
  completionDividerBeforeEntryId: string | null;
  completionSummary: string | null;
  turnDiffSummaryByAssistantMessageId: Map<MessageId, TurnDiffSummary>;
  nowIso: string;
  expandedWorkGroups: Record<string, boolean>;
  onToggleWorkGroup: (groupId: string) => void;
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
  revertTurnCountByUserMessageId: Map<MessageId, number>;
  onRevertUserMessage: (messageId: MessageId) => void;
  onEditUserMessage: (input: {
    messageId: MessageId;
    text: string;
    hadAttachments: boolean;
  }) => void;
  isRevertingCheckpoint: boolean;
  onImageExpand: (preview: ExpandedImagePreview) => void;
  markdownCwd: string | undefined;
  resolvedTheme: "light" | "dark";
  timestampFormat: TimestampFormat;
  workspaceRoot: string | undefined;
  emptyStateProjectName?: string | null;
  onVirtualizerSnapshot?: (snapshot: {
    totalSize: number;
    measurements: ReadonlyArray<{
      id: string;
      kind: MessagesTimelineRow["kind"];
      index: number;
      size: number;
      start: number;
      end: number;
    }>;
  }) => void;
}

export const MessagesTimeline = memo(function MessagesTimeline({
  hasMessages,
  isWorking,
  activeTurnInProgress,
  activeTurnStartedAt,
  scrollContainer,
  timelineEntries,
  completionDividerBeforeEntryId,
  completionSummary,
  turnDiffSummaryByAssistantMessageId,
  nowIso,
  expandedWorkGroups,
  onToggleWorkGroup,
  onOpenTurnDiff,
  revertTurnCountByUserMessageId,
  onRevertUserMessage,
  onEditUserMessage,
  isRevertingCheckpoint,
  onImageExpand,
  markdownCwd,
  resolvedTheme,
  timestampFormat,
  workspaceRoot,
  emptyStateProjectName,
  onVirtualizerSnapshot,
}: MessagesTimelineProps) {
  const timelineRootRef = useRef<HTMLDivElement | null>(null);
  const [timelineWidthPx, setTimelineWidthPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const timelineRoot = timelineRootRef.current;
    if (!timelineRoot) return;

    const updateWidth = (nextWidth: number) => {
      setTimelineWidthPx((previousWidth) => {
        if (previousWidth !== null && Math.abs(previousWidth - nextWidth) < 0.5) {
          return previousWidth;
        }
        return nextWidth;
      });
    };

    updateWidth(timelineRoot.getBoundingClientRect().width);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      updateWidth(timelineRoot.getBoundingClientRect().width);
    });
    observer.observe(timelineRoot);
    return () => {
      observer.disconnect();
    };
  }, [hasMessages, isWorking]);

  const rows = useMemo(
    () =>
      deriveMessagesTimelineRows({
        timelineEntries,
        completionDividerBeforeEntryId,
      }),
    [timelineEntries, completionDividerBeforeEntryId],
  );

  const firstUnvirtualizedRowIndex = useMemo(() => {
    const firstTailRowIndex = Math.max(rows.length - ALWAYS_UNVIRTUALIZED_TAIL_ROWS, 0);
    if (!activeTurnInProgress) return firstTailRowIndex;

    const turnStartedAtMs =
      typeof activeTurnStartedAt === "string" ? Date.parse(activeTurnStartedAt) : Number.NaN;
    let firstCurrentTurnRowIndex = -1;
    if (!Number.isNaN(turnStartedAtMs)) {
      firstCurrentTurnRowIndex = rows.findIndex((row) => {
        const rowCreatedAtMs = Date.parse(row.createdAt);
        return !Number.isNaN(rowCreatedAtMs) && rowCreatedAtMs >= turnStartedAtMs;
      });
    }

    if (firstCurrentTurnRowIndex < 0) {
      firstCurrentTurnRowIndex = rows.findIndex(
        (row) => row.kind === "message" && row.message.streaming,
      );
    }

    if (firstCurrentTurnRowIndex < 0) return firstTailRowIndex;

    for (let index = firstCurrentTurnRowIndex - 1; index >= 0; index -= 1) {
      const previousRow = rows[index];
      if (!previousRow || previousRow.kind !== "message") continue;
      if (previousRow.message.role === "user") {
        return Math.min(index, firstTailRowIndex);
      }
      if (previousRow.message.role === "assistant" && !previousRow.message.streaming) {
        break;
      }
    }

    return Math.min(firstCurrentTurnRowIndex, firstTailRowIndex);
  }, [activeTurnInProgress, activeTurnStartedAt, rows]);

  const virtualizedRowCount = clamp(firstUnvirtualizedRowIndex, {
    minimum: 0,
    maximum: rows.length,
  });
  const virtualMeasurementScopeKey =
    timelineWidthPx === null ? "width:unknown" : `width:${Math.round(timelineWidthPx)}`;

  const rowVirtualizer = useVirtualizer({
    count: virtualizedRowCount,
    getScrollElement: () => scrollContainer,
    // Scope cached row measurements to the current timeline width so offscreen
    // rows do not keep stale heights after wrapping changes.
    getItemKey: (index: number) => {
      const rowId = rows[index]?.id ?? String(index);
      return `${virtualMeasurementScopeKey}:${rowId}`;
    },
    estimateSize: (index: number) => {
      const row = rows[index];
      if (!row) return 96;
      return estimateMessagesTimelineRowHeight(row, {
        expandedWorkGroups,
        timelineWidthPx,
        turnDiffSummaryByAssistantMessageId,
      });
    },
    measureElement: measureVirtualElement,
    useAnimationFrameWithResizeObserver: true,
    overscan: 8,
  });
  useEffect(() => {
    if (timelineWidthPx === null) return;
    rowVirtualizer.measure();
  }, [rowVirtualizer, timelineWidthPx]);
  useEffect(() => {
    rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
      const viewportHeight = instance.scrollRect?.height ?? 0;
      const scrollOffset = instance.scrollOffset ?? 0;
      const itemIntersectsViewport =
        item.end > scrollOffset && item.start < scrollOffset + viewportHeight;
      if (itemIntersectsViewport) {
        return false;
      }
      const remainingDistance = instance.getTotalSize() - (scrollOffset + viewportHeight);
      return remainingDistance > AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
    };
    return () => {
      rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined;
    };
  }, [rowVirtualizer]);
  const pendingMeasureFrameRef = useRef<number | null>(null);
  const onTimelineImageLoad = useCallback(() => {
    if (pendingMeasureFrameRef.current !== null) return;
    pendingMeasureFrameRef.current = window.requestAnimationFrame(() => {
      pendingMeasureFrameRef.current = null;
      rowVirtualizer.measure();
    });
  }, [rowVirtualizer]);
  useEffect(() => {
    return () => {
      const frame = pendingMeasureFrameRef.current;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);
  useLayoutEffect(() => {
    if (!onVirtualizerSnapshot) {
      return;
    }
    onVirtualizerSnapshot({
      totalSize: rowVirtualizer.getTotalSize(),
      measurements: rowVirtualizer.measurementsCache
        .slice(0, virtualizedRowCount)
        .flatMap((measurement) => {
          const row = rows[measurement.index];
          if (!row) {
            return [];
          }
          return [
            {
              id: row.id,
              kind: row.kind,
              index: measurement.index,
              size: measurement.size,
              start: measurement.start,
              end: measurement.end,
            },
          ];
        }),
    });
  }, [onVirtualizerSnapshot, rowVirtualizer, rows, virtualizedRowCount]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const nonVirtualizedRows = rows.slice(virtualizedRowCount);
  const [allDirectoriesExpandedByTurnId, setAllDirectoriesExpandedByTurnId] = useState<
    Record<string, boolean>
  >({});
  const onToggleAllDirectories = useCallback((turnId: TurnId) => {
    setAllDirectoriesExpandedByTurnId((current) => ({
      ...current,
      [turnId]: !(current[turnId] ?? true),
    }));
  }, []);

  const renderRowContent = (row: TimelineRow) => (
    <div
      className="pb-4"
      data-timeline-row-id={row.id}
      data-timeline-row-kind={row.kind}
      data-message-id={row.kind === "message" ? row.message.id : undefined}
      data-message-role={row.kind === "message" ? row.message.role : undefined}
    >
      {row.kind === "work" &&
        (() => {
          const groupId = row.id;
          const groupedEntries = row.groupedEntries;
          const isExpanded = expandedWorkGroups[groupId] ?? false;
          const subagentInvocations = mergeSubagentInvocations(
            groupedEntries.flatMap((entry) => (entry.subagent ? [entry.subagent] : [])),
          );
          if (subagentInvocations.length > 0) {
            return (
              <SubagentWorkGroup
                invocations={subagentInvocations}
                groupedEntries={groupedEntries}
                rowId={groupId}
                isExpanded={isExpanded}
                onToggle={() => onToggleWorkGroup(groupId)}
              />
            );
          }

          const onlyToolEntries = groupedEntries.every((entry) => entry.tone === "tool");
          const canCollapse = onlyToolEntries;
          const hasOverflow = canCollapse && groupedEntries.length > MAX_VISIBLE_WORK_LOG_ENTRIES;
          const visibleEntries =
            hasOverflow && !isExpanded
              ? groupedEntries.slice(-MAX_VISIBLE_WORK_LOG_ENTRIES)
              : groupedEntries;
          const hiddenCount = groupedEntries.length - visibleEntries.length;
          const showHeader = hasOverflow || !onlyToolEntries;
          const groupLabel = onlyToolEntries ? "Tool calls" : "Work log";

          return (
            <div className="rounded-xl border border-border/45 bg-card/25 px-2 py-1.5">
              {showHeader && (
                <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/55">
                    {groupLabel} ({groupedEntries.length})
                  </p>
                  {hasOverflow && (
                    <button
                      type="button"
                      className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/55 transition-colors duration-150 hover:text-foreground/75"
                      onClick={() => onToggleWorkGroup(groupId)}
                    >
                      {isExpanded ? "Show less" : `Show ${hiddenCount} more`}
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-0.5">
                {visibleEntries.map((workEntry) => (
                  <SimpleWorkEntryRow
                    key={`work-row:${workEntry.id}`}
                    workEntry={workEntry}
                    resolvedTheme={resolvedTheme}
                  />
                ))}
              </div>
            </div>
          );
        })()}

      {row.kind === "message" &&
        row.message.role === "user" &&
        (() => {
          const userImages = row.message.attachments ?? [];
          const displayedUserMessage = deriveDisplayedUserMessageState(row.message.text);
          const terminalContexts = displayedUserMessage.contexts;
          const canRevertAgentWork = revertTurnCountByUserMessageId.has(row.message.id);
          return (
            <div className="flex justify-end">
              <div className="group relative max-w-[80%] rounded-2xl rounded-br-sm border border-border bg-secondary px-4 py-3">
                {userImages.length > 0 && (
                  <div className="mb-2 grid max-w-[420px] grid-cols-2 gap-2">
                    {userImages.map(
                      (image: NonNullable<TimelineMessage["attachments"]>[number]) => (
                        <div
                          key={image.id}
                          className="overflow-hidden rounded-lg border border-border/80 bg-background/70"
                        >
                          {image.previewUrl ? (
                            <button
                              type="button"
                              className="h-full w-full cursor-zoom-in"
                              aria-label={`Preview ${image.name}`}
                              onClick={() => {
                                const preview = buildExpandedImagePreview(userImages, image.id);
                                if (!preview) return;
                                onImageExpand(preview);
                              }}
                            >
                              <img
                                src={image.previewUrl}
                                alt={image.name}
                                className="block h-auto max-h-[220px] w-full object-cover"
                                onLoad={onTimelineImageLoad}
                                onError={onTimelineImageLoad}
                              />
                            </button>
                          ) : (
                            <div className="flex min-h-[72px] items-center justify-center px-2 py-3 text-center text-[11px] text-muted-foreground/70">
                              {image.name}
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}
                {(displayedUserMessage.visibleText.trim().length > 0 ||
                  terminalContexts.length > 0) && (
                  <UserMessageBody
                    text={displayedUserMessage.visibleText}
                    terminalContexts={terminalContexts}
                  />
                )}
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
                    {displayedUserMessage.copyText && (
                      <>
                        <MessageCopyButton text={displayedUserMessage.copyText} />
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            onEditUserMessage({
                              messageId: row.message.id,
                              text: displayedUserMessage.copyText,
                              hadAttachments: userImages.length > 0,
                            })
                          }
                          title="Edit message and start new conversation from here"
                          aria-label="Edit message and start new conversation from here"
                        >
                          <SquarePenIcon className="size-3" />
                        </Button>
                      </>
                    )}
                    {canRevertAgentWork && (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={isRevertingCheckpoint || isWorking}
                        onClick={() => onRevertUserMessage(row.message.id)}
                        title="Revert to this message"
                      >
                        <Undo2Icon className="size-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-right text-[10px] text-muted-foreground/30">
                    {formatTimestamp(row.message.createdAt, timestampFormat)}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

      {row.kind === "message" &&
        row.message.role === "assistant" &&
        (() => {
          const messageText = row.message.text || (row.message.streaming ? "" : "(empty response)");
          return (
            <>
              {row.showCompletionDivider && (
                <div className="my-3 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
                    {completionSummary ? `Response • ${completionSummary}` : "Response"}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className="min-w-0 px-1 py-0.5">
                <ChatMarkdown
                  text={messageText}
                  cwd={markdownCwd}
                  isStreaming={Boolean(row.message.streaming)}
                />
                {(() => {
                  const turnSummary = turnDiffSummaryByAssistantMessageId.get(row.message.id);
                  if (!turnSummary) return null;
                  const checkpointFiles = turnSummary.files;
                  if (checkpointFiles.length === 0) return null;
                  const summaryStat = summarizeTurnDiffStats(checkpointFiles);
                  const changedFileCountLabel = String(checkpointFiles.length);
                  const allDirectoriesExpanded =
                    allDirectoriesExpandedByTurnId[turnSummary.turnId] ?? true;
                  return (
                    <div className="mt-2 rounded-lg border border-border/80 bg-card/45 p-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/65">
                          <span>Changed files ({changedFileCountLabel})</span>
                          {hasNonZeroStat(summaryStat) && (
                            <>
                              <span className="mx-1">•</span>
                              <DiffStatLabel
                                additions={summaryStat.additions}
                                deletions={summaryStat.deletions}
                              />
                            </>
                          )}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            data-scroll-anchor-ignore
                            onClick={() => onToggleAllDirectories(turnSummary.turnId)}
                          >
                            {allDirectoriesExpanded ? "Collapse all" : "Expand all"}
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              onOpenTurnDiff(turnSummary.turnId, checkpointFiles[0]?.path)
                            }
                          >
                            View diff
                          </Button>
                        </div>
                      </div>
                      <ChangedFilesTree
                        key={`changed-files-tree:${turnSummary.turnId}`}
                        turnId={turnSummary.turnId}
                        files={checkpointFiles}
                        allDirectoriesExpanded={allDirectoriesExpanded}
                        resolvedTheme={resolvedTheme}
                        onOpenTurnDiff={onOpenTurnDiff}
                      />
                    </div>
                  );
                })()}
                <p className="mt-1.5 text-[10px] text-muted-foreground/30">
                  {formatMessageMeta(
                    row.message.createdAt,
                    row.message.streaming
                      ? formatElapsed(row.durationStart, nowIso)
                      : formatElapsed(row.durationStart, row.message.completedAt),
                    timestampFormat,
                  )}
                </p>
              </div>
            </>
          );
        })()}

      {row.kind === "proposed-plan" && (
        <div className="min-w-0 px-1 py-0.5">
          <ProposedPlanCard
            planMarkdown={row.proposedPlan.planMarkdown}
            cwd={markdownCwd}
            workspaceRoot={workspaceRoot}
          />
        </div>
      )}
    </div>
  );

  if (!hasMessages && !isWorking) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-center text-sm font-medium text-warning">
          {emptyStateProjectName ?? "Send a message to start the conversation."}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={timelineRootRef}
      data-timeline-root="true"
      className="mx-auto w-full min-w-0 max-w-3xl overflow-x-hidden"
    >
      {virtualizedRowCount > 0 && (
        <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          {virtualRows.map((virtualRow: VirtualItem) => {
            const row = rows[virtualRow.index];
            if (!row) return null;

            return (
              <div
                key={`virtual-row:${row.id}`}
                data-index={virtualRow.index}
                data-virtual-row-id={row.id}
                data-virtual-row-kind={row.kind}
                data-virtual-row-size={virtualRow.size}
                data-virtual-row-start={virtualRow.start}
                ref={rowVirtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderRowContent(row)}
              </div>
            );
          })}
        </div>
      )}

      {nonVirtualizedRows.map((row) => (
        <div key={`non-virtual-row:${row.id}`}>{renderRowContent(row)}</div>
      ))}
    </div>
  );
});

type TimelineEntry = ReturnType<typeof deriveTimelineEntries>[number];
type TimelineMessage = Extract<TimelineEntry, { kind: "message" }>["message"];
type TimelineRow = MessagesTimelineRow;

function formatMessageMeta(
  createdAt: string,
  duration: string | null,
  timestampFormat: TimestampFormat,
): string {
  if (!duration) return formatTimestamp(createdAt, timestampFormat);
  return `${formatTimestamp(createdAt, timestampFormat)} • ${duration}`;
}

const UserMessageTerminalContextInlineLabel = memo(
  function UserMessageTerminalContextInlineLabel(props: { context: ParsedTerminalContextEntry }) {
    const tooltipText =
      props.context.body.length > 0
        ? `${props.context.header}\n${props.context.body}`
        : props.context.header;

    return <TerminalContextInlineChip label={props.context.header} tooltipText={tooltipText} />;
  },
);

const UserMessageBody = memo(function UserMessageBody(props: {
  text: string;
  terminalContexts: ParsedTerminalContextEntry[];
}) {
  if (props.terminalContexts.length > 0) {
    const hasEmbeddedInlineLabels = textContainsInlineTerminalContextLabels(
      props.text,
      props.terminalContexts,
    );
    const inlinePrefix = buildInlineTerminalContextText(props.terminalContexts);
    const inlineNodes: ReactNode[] = [];

    if (hasEmbeddedInlineLabels) {
      let cursor = 0;

      for (const context of props.terminalContexts) {
        const label = formatInlineTerminalContextLabel(context.header);
        const matchIndex = props.text.indexOf(label, cursor);
        if (matchIndex === -1) {
          inlineNodes.length = 0;
          break;
        }
        if (matchIndex > cursor) {
          inlineNodes.push(
            <span key={`user-terminal-context-inline-before:${context.header}:${cursor}`}>
              {props.text.slice(cursor, matchIndex)}
            </span>,
          );
        }
        inlineNodes.push(
          <UserMessageTerminalContextInlineLabel
            key={`user-terminal-context-inline:${context.header}`}
            context={context}
          />,
        );
        cursor = matchIndex + label.length;
      }

      if (inlineNodes.length > 0) {
        if (cursor < props.text.length) {
          inlineNodes.push(
            <span key={`user-message-terminal-context-inline-rest:${cursor}`}>
              {props.text.slice(cursor)}
            </span>,
          );
        }

        return (
          <div className="wrap-break-word whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
            {inlineNodes}
          </div>
        );
      }
    }

    for (const context of props.terminalContexts) {
      inlineNodes.push(
        <UserMessageTerminalContextInlineLabel
          key={`user-terminal-context-inline:${context.header}`}
          context={context}
        />,
      );
      inlineNodes.push(
        <span key={`user-terminal-context-inline-space:${context.header}`} aria-hidden="true">
          {" "}
        </span>,
      );
    }

    if (props.text.length > 0) {
      inlineNodes.push(<span key="user-message-terminal-context-inline-text">{props.text}</span>);
    } else if (inlinePrefix.length === 0) {
      return null;
    }

    return (
      <div className="wrap-break-word whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
        {inlineNodes}
      </div>
    );
  }

  if (props.text.length === 0) {
    return null;
  }

  return (
    <pre className="whitespace-pre-wrap wrap-break-word font-mono text-sm leading-relaxed text-foreground">
      {props.text}
    </pre>
  );
});

function subagentModeLabel(mode: SubagentInvocation["mode"]): string {
  switch (mode) {
    case "chain":
      return "Series";
    case "parallel":
      return "Parallel";
    default:
      return "Single";
  }
}

function subagentStatusLabel(status: SubagentInvocation["overallStatus"]): string {
  switch (status) {
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    case "aborted":
      return "Stopped";
    default:
      return "Running";
  }
}

function subagentStatusClass(status: SubagentInvocation["overallStatus"]): string {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "failed":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    case "aborted":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    default:
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  }
}

function subagentResultSummaryByAgent(
  summaries: ReadonlyArray<SubagentResultSummary>,
): Map<string, SubagentResultSummary> {
  return new Map(summaries.map((summary) => [summary.agent.toLowerCase(), summary]));
}

const SubagentWorkGroup = memo(function SubagentWorkGroup(props: {
  invocations: ReadonlyArray<SubagentInvocation>;
  groupedEntries: ReadonlyArray<WorkLogEntry>;
  rowId: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const nonSubagentEntries = props.groupedEntries.filter((entry) => !entry.subagent);
  const hasOverflow = nonSubagentEntries.length > MAX_VISIBLE_WORK_LOG_ENTRIES;
  const visibleUpdateEntries =
    hasOverflow && !props.isExpanded
      ? nonSubagentEntries.slice(-MAX_VISIBLE_WORK_LOG_ENTRIES)
      : nonSubagentEntries;
  const hiddenCount = nonSubagentEntries.length - visibleUpdateEntries.length;

  return (
    <div className="rounded-xl border border-border/55 bg-card/30 px-2.5 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/55">
            Subagents ({props.invocations.length})
          </p>
          <p className="text-[11px] text-muted-foreground/65">
            Blocks show delegation shape, handoffs, and live updates.
          </p>
        </div>
        {hasOverflow && (
          <button
            type="button"
            className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/55 transition-colors duration-150 hover:text-foreground/75"
            onClick={props.onToggle}
          >
            {props.isExpanded ? "Hide updates" : `Show ${hiddenCount} more updates`}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {props.invocations.map((invocation) => (
          <SubagentInvocationCard
            key={`${props.rowId}:subagent:${invocation.key}`}
            invocation={invocation}
          />
        ))}
      </div>

      {visibleUpdateEntries.length > 0 && (
        <div className="mt-3 border-t border-border/40 pt-2">
          <p className="mb-1 px-0.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground/55">
            Updates ({nonSubagentEntries.length})
          </p>
          <div className="space-y-0.5">
            {visibleUpdateEntries.map((workEntry) => (
              <SimpleWorkEntryRow
                key={`subagent-update:${workEntry.id}`}
                workEntry={workEntry}
                resolvedTheme={resolvedTheme}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

const SubagentInvocationCard = memo(function SubagentInvocationCard(props: {
  invocation: SubagentInvocation;
}) {
  const resultSummaryByAgent = subagentResultSummaryByAgent(props.invocation.resultSummaries);
  const stepsClassName =
    props.invocation.mode === "parallel" ? "grid gap-2 sm:grid-cols-2" : "space-y-2";

  return (
    <div className="rounded-xl border border-border/55 bg-background/60 p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-border/55 bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80">
          {subagentModeLabel(props.invocation.mode)}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            subagentStatusClass(props.invocation.overallStatus),
          )}
        >
          {subagentStatusLabel(props.invocation.overallStatus)}
        </span>
        {props.invocation.agentScope && (
          <span className="rounded-full border border-border/55 bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground/75">
            scope {props.invocation.agentScope}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/60">
          {props.invocation.steps.length} step{props.invocation.steps.length === 1 ? "" : "s"}
        </span>
      </div>

      {props.invocation.description && (
        <p className="mb-2 text-[11px] leading-5 text-muted-foreground/75">
          {props.invocation.description}
        </p>
      )}

      <div className={stepsClassName}>
        {props.invocation.steps.map((step, index) => {
          const summary = resultSummaryByAgent.get(step.agent.toLowerCase());
          return (
            <div key={`${props.invocation.key}:step:${step.agent}:${step.task}:${step.cwd ?? ""}`}>
              <div className="rounded-lg border border-border/55 bg-card/45 p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-foreground/85">{step.agent}</span>
                  {summary && (
                    <span className="text-[10px] text-muted-foreground/65">{summary.summary}</span>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-[11px] leading-5 text-muted-foreground/75">
                  {step.task}
                </p>
                {step.cwd && (
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground/55">
                    cwd: {step.cwd}
                  </p>
                )}
              </div>
              {props.invocation.mode === "chain" && index < props.invocation.steps.length - 1 && (
                <div className="flex items-center gap-2 px-1 py-1.5 text-[10px] text-muted-foreground/60">
                  <ChevronDownIcon className="size-3" />
                  <span>
                    {props.invocation.steps[index + 1]?.usesPrevious
                      ? "Passes previous output forward"
                      : "Runs next step after this one"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {props.invocation.mode === "parallel" && props.invocation.steps.length > 1 && (
        <p className="mt-2 text-[10px] text-muted-foreground/60">
          Parallel branches run side by side, then results merge back into main chat.
        </p>
      )}
    </div>
  );
});

function workToneIcon(tone: WorkLogEntry["tone"]): {
  icon: LucideIcon;
  className: string;
} {
  if (tone === "error") {
    return {
      icon: CircleAlertIcon,
      className: "text-foreground/92",
    };
  }
  if (tone === "thinking") {
    return {
      icon: BotIcon,
      className: "text-foreground/92",
    };
  }
  if (tone === "info") {
    return {
      icon: CheckIcon,
      className: "text-foreground/92",
    };
  }
  return {
    icon: ZapIcon,
    className: "text-foreground/92",
  };
}

function workToneClass(tone: "thinking" | "tool" | "info" | "error"): string {
  if (tone === "error") return "text-rose-300/50 dark:text-rose-300/50";
  if (tone === "tool") return "text-muted-foreground/70";
  if (tone === "thinking") return "text-muted-foreground/50";
  return "text-muted-foreground/40";
}

function workEntryPreview(
  workEntry: Pick<WorkLogEntry, "preview" | "detail" | "command" | "changedFiles">,
) {
  if (workEntry.command) return workEntry.command;
  if (workEntry.preview) return workEntry.preview;
  if (workEntry.detail) return workEntry.detail;
  if ((workEntry.changedFiles?.length ?? 0) === 0) return null;
  const [firstPath] = workEntry.changedFiles ?? [];
  if (!firstPath) return null;
  return workEntry.changedFiles!.length === 1
    ? firstPath
    : `${firstPath} +${workEntry.changedFiles!.length - 1} more`;
}

function workEntryRawCommand(
  workEntry: Pick<WorkLogEntry, "command" | "rawCommand">,
): string | null {
  const rawCommand = workEntry.rawCommand?.trim();
  if (!rawCommand || !workEntry.command) {
    return null;
  }
  return rawCommand === workEntry.command.trim() ? null : rawCommand;
}

function workEntryIcon(workEntry: WorkLogEntry): LucideIcon {
  if (workEntry.requestKind === "command") return TerminalIcon;
  if (workEntry.requestKind === "file-read") return EyeIcon;
  if (workEntry.requestKind === "file-change") return SquarePenIcon;

  if (workEntry.itemType === "command_execution" || workEntry.command) {
    return TerminalIcon;
  }
  if (workEntry.itemType === "file_change" || (workEntry.changedFiles?.length ?? 0) > 0) {
    return SquarePenIcon;
  }
  if (workEntry.itemType === "web_search") return GlobeIcon;
  if (workEntry.itemType === "image_view") return EyeIcon;

  switch (workEntry.itemType) {
    case "mcp_tool_call":
      return WrenchIcon;
    case "dynamic_tool_call":
    case "collab_agent_tool_call":
      return HammerIcon;
  }

  return workToneIcon(workEntry.tone).icon;
}

function capitalizePhrase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value;
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function toolWorkEntryHeading(workEntry: WorkLogEntry): string {
  if (!workEntry.toolTitle) {
    return capitalizePhrase(normalizeCompactToolLabel(workEntry.label));
  }
  return capitalizePhrase(normalizeCompactToolLabel(workEntry.toolTitle));
}

export const SimpleWorkEntryRow = memo(function SimpleWorkEntryRow(props: {
  workEntry: WorkLogEntry;
  resolvedTheme: "light" | "dark";
}) {
  const { workEntry } = props;
  const iconConfig = workToneIcon(workEntry.tone);
  const EntryIcon = workEntryIcon(workEntry);
  const heading = toolWorkEntryHeading(workEntry);
  const rawCommand = workEntryRawCommand(workEntry);
  const hasChangedFiles = (workEntry.changedFiles?.length ?? 0) > 0;
  const previewIsChangedFiles = hasChangedFiles && !workEntry.command && !workEntry.detail;
  const detailBlockText =
    typeof workEntry.detail === "string" &&
    workEntry.detail.length > 0 &&
    (workEntry.streamKind !== undefined ||
      workEntry.tone === "thinking" ||
      workEntry.detail.includes("\n") ||
      workEntry.detail.length > 140)
      ? workEntry.detail
      : null;
  const preview =
    workEntry.tone === "thinking" && detailBlockText !== null && !workEntry.preview
      ? null
      : workEntryPreview(workEntry);
  const displayText = preview ? `${heading} - ${preview}` : heading;
  const useToolCard =
    (workEntry.tone === "tool" || workEntry.tone === "thinking") &&
    (preview !== null || detailBlockText !== null || heading.length > 0);

  if (useToolCard) {
    return (
      <ToolWorkEntryCard
        workEntry={workEntry}
        heading={heading}
        preview={preview}
        rawCommand={rawCommand}
        detailBlockText={detailBlockText}
        hasChangedFiles={hasChangedFiles}
        previewIsChangedFiles={previewIsChangedFiles}
        resolvedTheme={props.resolvedTheme}
      />
    );
  }

  return (
    <div className="rounded-lg px-1 py-1">
      <div className="flex items-center gap-2 transition-[opacity,translate] duration-200">
        <span
          className={cn("flex size-5 shrink-0 items-center justify-center", iconConfig.className)}
        >
          <EntryIcon className="size-3" />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="max-w-full">
            <p
              className={cn(
                detailBlockText ? "text-[11px] leading-5" : "truncate text-[11px] leading-5",
                workToneClass(workEntry.tone),
                preview ? "text-muted-foreground/70" : "",
              )}
              title={rawCommand || detailBlockText ? undefined : displayText}
            >
              <span className={cn("text-foreground/80", workToneClass(workEntry.tone))}>
                {heading}
              </span>
              {preview &&
                (rawCommand ? (
                  <Tooltip>
                    <TooltipTrigger
                      closeDelay={0}
                      delay={75}
                      render={
                        <span className="max-w-full cursor-default text-muted-foreground/55 transition-colors hover:text-muted-foreground/75 focus-visible:text-muted-foreground/75">
                          {" "}
                          - {preview}
                        </span>
                      }
                    />
                    <TooltipPopup
                      align="start"
                      className="max-w-[min(56rem,calc(100vw-2rem))] px-0 py-0"
                      side="top"
                    >
                      <div className="max-w-[min(56rem,calc(100vw-2rem))] overflow-x-auto px-1.5 py-1 font-mono text-[11px] leading-4 whitespace-nowrap">
                        {rawCommand}
                      </div>
                    </TooltipPopup>
                  </Tooltip>
                ) : (
                  <span className="text-muted-foreground/55"> - {preview}</span>
                ))}
            </p>
          </div>
        </div>
      </div>
      {detailBlockText && (
        <div className="mt-1 pl-6">
          <pre className="max-h-[28rem] overflow-auto rounded-md border border-border/55 bg-background/75 px-2 py-1.5 font-mono text-[11px] leading-4 whitespace-pre-wrap break-words text-foreground/80">
            {detailBlockText}
          </pre>
        </div>
      )}
      {hasChangedFiles && !previewIsChangedFiles && (
        <div className="mt-1 flex flex-wrap gap-1 pl-6">
          {workEntry.changedFiles?.slice(0, 4).map((filePath: string) => (
            <span
              key={`${workEntry.id}:${filePath}`}
              className="rounded-md border border-border/55 bg-background/75 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/75"
              title={filePath}
            >
              {filePath}
            </span>
          ))}
          {(workEntry.changedFiles?.length ?? 0) > 4 && (
            <span className="px-1 text-[10px] text-muted-foreground/55">
              +{(workEntry.changedFiles?.length ?? 0) - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

function isCommandToolWorkEntry(workEntry: WorkLogEntry): boolean {
  return workEntry.requestKind === "command" || workEntry.itemType === "command_execution";
}

function formatCommandTimeoutLabel(timeoutMs: number | undefined): string | null {
  if (timeoutMs === undefined || timeoutMs < 0) {
    return null;
  }
  if (timeoutMs % 1_000 === 0 && timeoutMs < 600_000) {
    return `timeout ${timeoutMs / 1_000}s`;
  }
  return `timeout ${formatDuration(timeoutMs)}`;
}

function commandWorkEntryStatusSummary(workEntry: WorkLogEntry): string | null {
  if (workEntry.cancelled) {
    return "Cancelled";
  }
  if (workEntry.exitCode !== undefined && workEntry.exitCode !== 0) {
    return `Exited with code ${workEntry.exitCode}`;
  }
  return null;
}

type ToolWorkCardVariant = "default" | "command" | "thinking";

function toolWorkCardVariant(workEntry: WorkLogEntry): ToolWorkCardVariant {
  if (workEntry.tone === "thinking") {
    return "thinking";
  }
  if (isCommandToolWorkEntry(workEntry)) {
    return "command";
  }
  return "default";
}

const ToolWorkEntryCard = memo(function ToolWorkEntryCard(props: {
  workEntry: WorkLogEntry;
  heading: string;
  preview: string | null;
  rawCommand: string | null;
  detailBlockText: string | null;
  hasChangedFiles: boolean;
  previewIsChangedFiles: boolean;
  resolvedTheme: "light" | "dark";
}) {
  const {
    workEntry,
    heading,
    preview,
    rawCommand,
    detailBlockText,
    hasChangedFiles,
    previewIsChangedFiles,
  } = props;
  const lowerHeading = heading.trim().toLowerCase();
  const variant = toolWorkCardVariant(workEntry);
  const isCommandCard = variant === "command";
  const isThinkingCard = variant === "thinking";
  const timeoutLabel = formatCommandTimeoutLabel(workEntry.timeoutMs);
  const durationLabel =
    workEntry.durationMs !== undefined ? `Took ${formatDuration(workEntry.durationMs)}` : null;
  const statusLabel = commandWorkEntryStatusSummary(workEntry);
  const commandText = workEntry.command ?? preview ?? lowerHeading;

  if (isCommandCard) {
    return (
      <div
        className="tool-work-card tool-work-card--command rounded-xl border px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
        data-tool-work-card-variant="command"
      >
        <div className="font-mono text-[13px] leading-7">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-semibold text-[var(--tool-card-title)]">$</span>
            {rawCommand ? (
              <Tooltip>
                <TooltipTrigger
                  closeDelay={0}
                  delay={75}
                  render={
                    <span className="min-w-0 break-all font-semibold text-[var(--tool-card-title)] transition-opacity hover:opacity-100">
                      {commandText}
                    </span>
                  }
                />
                <TooltipPopup
                  align="start"
                  className="max-w-[min(56rem,calc(100vw-2rem))] px-0 py-0"
                  side="top"
                >
                  <div className="max-w-[min(56rem,calc(100vw-2rem))] overflow-x-auto px-1.5 py-1 font-mono text-[11px] leading-4 whitespace-nowrap">
                    {rawCommand}
                  </div>
                </TooltipPopup>
              </Tooltip>
            ) : (
              <span className="min-w-0 break-all font-semibold text-[var(--tool-card-title)]">
                {commandText}
              </span>
            )}
            {timeoutLabel && (
              <span className="text-[var(--tool-card-muted)]/78">({timeoutLabel})</span>
            )}
          </div>

          {detailBlockText && (
            <div className="mt-3 overflow-hidden rounded-lg border border-white/6 bg-black/8">
              <ToolOutputBlock
                text={detailBlockText}
                variant="command"
                resolvedTheme={props.resolvedTheme}
              />
            </div>
          )}

          {(durationLabel || statusLabel || workEntry.truncated || workEntry.fullOutputPath) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-6 text-[var(--tool-card-muted)]/82">
              {durationLabel && <span>{durationLabel}</span>}
              {statusLabel && <span>{statusLabel}</span>}
              {workEntry.truncated && <span>Output truncated</span>}
              {workEntry.fullOutputPath && (
                <span className="break-all">full output: {workEntry.fullOutputPath}</span>
              )}
            </div>
          )}

          {hasChangedFiles && !previewIsChangedFiles && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {workEntry.changedFiles?.slice(0, 4).map((filePath: string) => (
                <span
                  key={`${workEntry.id}:${filePath}`}
                  className="rounded-md border border-white/8 bg-black/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--tool-card-accent)]/85"
                  title={filePath}
                >
                  {filePath}
                </span>
              ))}
              {(workEntry.changedFiles?.length ?? 0) > 4 && (
                <span className="px-1 text-[10px] text-[var(--tool-card-fg)]/55">
                  +{(workEntry.changedFiles?.length ?? 0) - 4}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "tool-work-card rounded-xl border px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
        isThinkingCard && "tool-work-card--thinking",
      )}
      data-tool-work-card-variant={variant}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[var(--tool-card-title)]/85">
          {isThinkingCard ? <BotIcon className="size-3" /> : <WrenchIcon className="size-3" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="tool-work-card-header flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[12px] leading-5">
            <span className="font-semibold tracking-[0.01em] text-[var(--tool-card-title)]">
              {isThinkingCard ? heading : lowerHeading}
            </span>
            {preview &&
              (rawCommand ? (
                <Tooltip>
                  <TooltipTrigger
                    closeDelay={0}
                    delay={75}
                    render={
                      <span className="min-w-0 max-w-full cursor-default truncate text-[var(--tool-card-accent)]/90 transition-opacity hover:opacity-100">
                        {preview}
                      </span>
                    }
                  />
                  <TooltipPopup
                    align="start"
                    className="max-w-[min(56rem,calc(100vw-2rem))] px-0 py-0"
                    side="top"
                  >
                    <div className="max-w-[min(56rem,calc(100vw-2rem))] overflow-x-auto px-1.5 py-1 font-mono text-[11px] leading-4 whitespace-nowrap">
                      {rawCommand}
                    </div>
                  </TooltipPopup>
                </Tooltip>
              ) : (
                <span className="min-w-0 max-w-full truncate text-[var(--tool-card-accent)]/90">
                  {preview}
                </span>
              ))}
          </div>

          {detailBlockText && (
            <div className="mt-2 overflow-hidden rounded-lg border border-white/6 bg-black/8">
              <ToolOutputBlock text={detailBlockText} resolvedTheme={props.resolvedTheme} />
            </div>
          )}

          {hasChangedFiles && !previewIsChangedFiles && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {workEntry.changedFiles?.slice(0, 4).map((filePath: string) => (
                <span
                  key={`${workEntry.id}:${filePath}`}
                  className="rounded-md border border-white/8 bg-black/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--tool-card-accent)]/85"
                  title={filePath}
                >
                  {filePath}
                </span>
              ))}
              {(workEntry.changedFiles?.length ?? 0) > 4 && (
                <span className="px-1 text-[10px] text-[var(--tool-card-fg)]/55">
                  +{(workEntry.changedFiles?.length ?? 0) - 4}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const ToolOutputBlock = memo(function ToolOutputBlock(props: {
  text: string;
  variant?: "default" | "command";
  resolvedTheme: "light" | "dark";
}) {
  const language = inferToolOutputLanguage(props.text);
  const textClassName =
    props.variant === "command"
      ? "text-[var(--tool-card-muted)]/92"
      : "text-[var(--tool-card-fg)]/92";
  const renderablePatch = useMemo(
    () =>
      language === "diff"
        ? getRenderablePatch(props.text, `timeline-tool:${props.resolvedTheme}`)
        : null,
    [language, props.resolvedTheme, props.text],
  );

  if (language === "json") {
    return <JsonToolOutput text={props.text} textClassName={textClassName} />;
  }

  if (renderablePatch?.kind === "files") {
    return (
      <PatchToolOutput
        files={renderablePatch.files}
        resolvedTheme={props.resolvedTheme}
        textClassName={textClassName}
      />
    );
  }

  return (
    <pre
      className={cn(
        "max-h-[28rem] overflow-auto px-3 py-2 font-mono text-[12px] leading-6 whitespace-pre-wrap break-words",
        textClassName,
      )}
    >
      {renderToolOutputLines(props.text)}
    </pre>
  );
});

const PatchToolOutput = memo(function PatchToolOutput(props: {
  files: ReadonlyArray<Parameters<typeof resolveFileDiffPath>[0]>;
  resolvedTheme: "light" | "dark";
  textClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const sortedFiles = useMemo(
    () =>
      [...props.files].toSorted((left, right) =>
        resolveFileDiffPath(left).localeCompare(resolveFileDiffPath(right), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    [props.files],
  );
  const visibleFilePaths = sortedFiles.slice(0, 3).map((fileDiff) => resolveFileDiffPath(fileDiff));
  const hiddenFileCount = sortedFiles.length - visibleFilePaths.length;

  return (
    <>
      <div className="rounded-lg border border-white/8 bg-black/10 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--tool-card-title)]/88">
              Patch preview
            </p>
            <p className={cn("text-[11px]", props.textClassName)}>
              {sortedFiles.length} file{sortedFiles.length === 1 ? "" : "s"} changed
            </p>
          </div>
          <Button type="button" size="xs" variant="outline" onClick={() => setOpen(true)}>
            Open patch
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleFilePaths.map((filePath) => (
            <span
              key={`tool-patch-path:${filePath}`}
              className="rounded-md border border-white/8 bg-black/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--tool-card-accent)]/85"
              title={filePath}
            >
              {filePath}
            </span>
          ))}
          {hiddenFileCount > 0 && (
            <span className="px-1 text-[10px] text-[var(--tool-card-fg)]/55">
              +{hiddenFileCount}
            </span>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="flex h-[min(88vh,58rem)] max-w-[min(96vw,90rem)] flex-col overflow-hidden border-border/70 bg-background p-0">
          <DialogHeader className="border-b border-border/70 pb-4">
            <DialogTitle className="text-base">Patch preview</DialogTitle>
            <DialogDescription>Editor-style diff view for tool output in chat.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
            <Virtualizer
              className="h-full overflow-auto rounded-xl border border-border/70 bg-card/65 px-2 pb-2"
              config={{
                overscrollSize: 600,
                intersectionObserverMargin: 1200,
              }}
            >
              {sortedFiles.map((fileDiff) => {
                const filePath = resolveFileDiffPath(fileDiff);
                const fileKey = buildFileDiffRenderKey(fileDiff);
                const themedFileKey = `${fileKey}:${props.resolvedTheme}`;
                return (
                  <div
                    key={themedFileKey}
                    data-diff-file-path={filePath}
                    className="mb-2 rounded-md first:mt-2 last:mb-0"
                  >
                    <FileDiff
                      fileDiff={fileDiff}
                      options={{
                        diffStyle: "unified",
                        lineDiffType: "none",
                        overflow: "wrap",
                        theme: resolveDiffThemeName(props.resolvedTheme),
                        themeType: props.resolvedTheme,
                        unsafeCSS: DIFF_RENDER_UNSAFE_CSS,
                      }}
                    />
                  </div>
                );
              })}
            </Virtualizer>
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
});

function inferToolOutputLanguage(text: string): "json" | "diff" | "text" {
  const trimmed = text.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // Fall through.
    }
  }

  if (/^(?:@@|\+\+\+|---|\+[^\n]|-[^\n])/m.test(text)) {
    return "diff";
  }

  return "text";
}

function renderToolOutputLines(text: string): ReactNode {
  const language = inferToolOutputLanguage(text);
  const lines = text.split("\n");

  return lines.map((line, index) => {
    const key = `tool-output:${index}`;
    if (language === "diff") {
      if (line.startsWith("+")) {
        return (
          <Fragment key={key}>
            <span className="text-emerald-300">{line}</span>
            {index < lines.length - 1 ? "\n" : null}
          </Fragment>
        );
      }
      if (line.startsWith("-")) {
        return (
          <Fragment key={key}>
            <span className="text-rose-300">{line}</span>
            {index < lines.length - 1 ? "\n" : null}
          </Fragment>
        );
      }
      if (line.startsWith("@@") || line.startsWith("diff ")) {
        return (
          <Fragment key={key}>
            <span className="text-sky-300">{line}</span>
            {index < lines.length - 1 ? "\n" : null}
          </Fragment>
        );
      }
    }

    return (
      <Fragment key={key}>
        {line}
        {index < lines.length - 1 ? "\n" : null}
      </Fragment>
    );
  });
}

const JSON_TOKEN_PATTERN =
  /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([{}:,]|\[|\])/g;

const JsonToolOutput = memo(function JsonToolOutput(props: {
  text: string;
  textClassName?: string;
}) {
  const lines = props.text.split("\n");
  const lineCounts = new Map<string, number>();

  return (
    <pre
      className={cn(
        "max-h-[28rem] overflow-auto px-3 py-2 font-mono text-[12px] leading-6 whitespace-pre-wrap break-words",
        props.textClassName ?? "text-[var(--tool-card-fg)]/92",
      )}
    >
      {lines.map((line, index) => {
        const occurrence = (lineCounts.get(line) ?? 0) + 1;
        lineCounts.set(line, occurrence);
        return (
          <Fragment key={`json-tool-output:${line}:${occurrence}`}>
            {highlightJsonLine(line)}
            {index < lines.length - 1 ? "\n" : null}
          </Fragment>
        );
      })}
    </pre>
  );
});

function highlightJsonLine(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of line.matchAll(JSON_TOKEN_PATTERN)) {
    const matched = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(line.slice(cursor, index));
    }

    let className = "text-[var(--tool-card-fg)]/92";
    if (match[1]) {
      className = "text-sky-200";
    } else if (match[2]) {
      className = "text-orange-200";
    } else if (match[3]) {
      className = "text-violet-200";
    } else if (match[4]) {
      className = "text-pink-200";
    } else if (match[5]) {
      className = "text-[var(--tool-card-fg)]/60";
    }

    nodes.push(
      <span key={`json-token:${index}:${matched}`} className={className}>
        {matched}
      </span>,
    );
    cursor = index + matched.length;
  }

  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }

  return nodes;
}
