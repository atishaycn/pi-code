export interface StreamingMessageSnapshot<
  TTurnId extends string | null = string | null,
  TAttachment = unknown,
> {
  text: string;
  streaming: boolean;
  createdAt: string;
  updatedAt: string;
  turnId: TTurnId;
  attachments?: ReadonlyArray<TAttachment>;
}

export interface MergeStreamingMessageResult<
  TTurnId extends string | null = string | null,
  TAttachment = unknown,
> extends StreamingMessageSnapshot<TTurnId, TAttachment> {
  preventedReopen: boolean;
}

function laterIsoTimestamp(left: string, right: string): string {
  return left >= right ? left : right;
}

// Once an assistant message reaches a terminal/non-streaming state, later
// streaming deltas can extend the visible text but must not reopen it.
export function mergeStreamingMessageUpdate<TTurnId extends string | null, TAttachment = unknown>(
  existing: StreamingMessageSnapshot<TTurnId, TAttachment> | undefined,
  incoming: StreamingMessageSnapshot<TTurnId, TAttachment>,
): MergeStreamingMessageResult<TTurnId, TAttachment> {
  const preventedReopen = existing !== undefined && !existing.streaming && incoming.streaming;
  const nextText = incoming.streaming
    ? `${existing?.text ?? ""}${incoming.text}`
    : incoming.text.length === 0
      ? (existing?.text ?? "")
      : existing !== undefined &&
          existing.streaming &&
          existing.text.length > 0 &&
          !incoming.text.startsWith(existing.text)
        ? `${existing.text}${incoming.text}`
        : incoming.text;

  return {
    text: nextText,
    streaming: preventedReopen ? false : incoming.streaming,
    createdAt: existing?.createdAt ?? incoming.createdAt,
    updatedAt:
      preventedReopen && existing !== undefined
        ? existing.updatedAt
        : existing !== undefined
          ? laterIsoTimestamp(existing.updatedAt, incoming.updatedAt)
          : incoming.updatedAt,
    turnId: (incoming.turnId ?? existing?.turnId ?? null) as TTurnId,
    ...(incoming.attachments !== undefined
      ? { attachments: [...incoming.attachments] }
      : existing?.attachments !== undefined
        ? { attachments: [...existing.attachments] }
        : {}),
    preventedReopen,
  };
}
