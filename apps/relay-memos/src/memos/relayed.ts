import type { Bytes, Relayed } from "@notemap/relay";

import type { Memo, MemosAttachment } from "./types";

const MEMO = "memos/";

/** How the bytes of one attachment are reached, so the mapping needs no server. */
export type Open = (
  attachment: MemosAttachment,
  signal?: AbortSignal,
) => Promise<Bytes>;

/** The uid in `memos/{uid}`, which is what the pool holds as `sourceItemId`. */
export function uidOf(name: string): string {
  const uid = name.startsWith(MEMO) ? name.slice(MEMO.length) : "";
  if (uid === "") {
    throw new Error(`${name} is not a memo's resource name`);
  }
  return uid;
}

/**
 * One memo as the pool takes it, or nothing where there is nothing to take:
 * core lets an empty capture through, and each relay guards its own input.
 *
 * The content travels verbatim, `#tags` and all. Memos extracts those into
 * `tags` as well, and both are true of the memo — the prose is what was
 * written, and the classification is what it was written with.
 */
export function relayedFrom(memo: Memo, open: Open): Relayed | undefined {
  const attachments = (memo.attachments ?? []).map((attachment) => ({
    id: attachment.name,
    filename: attachment.filename,
    mime: attachment.type,
    open: (signal?: AbortSignal) => open(attachment, signal),
  }));

  const text = memo.content.trim() === "" ? undefined : memo.content;
  if (text === undefined && attachments.length === 0) return undefined;

  return {
    sourceItemId: uidOf(memo.name),
    version: memo.updateTime,
    // The memo's own creation time, so a memo written three days ago sits three
    // days back in the feed rather than at the top of the poll that found it.
    capturedAt: memo.createTime,
    ...(text === undefined ? {} : { text }),
    tags: memo.tags ?? [],
    attachments,
  };
}
