import { createHash } from "node:crypto";

import { classified } from "@notemap/relay";
import type { Bytes, Relayed } from "@notemap/relay";

import type { Memo, MemosAttachment } from "./types";

const MEMO = "memos/";

/** How this relay was asked to read a memo. */
export type Reading = {
  /** Whether a foot of `#tags` is read as tags and taken off the prose. */
  readonly hashtags: boolean;
};

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
 * The memo's own update time, and — where this relay's reading changed the words
 * — a digest of the words it is sending beside it. An edit is captured under an
 * identity built from the version, and the pool matches a replayed edit on its
 * payload: two readings of one memo claiming one identity means the second is
 * refused as a conflicting resubmission, every poll, for as long as both exist.
 * A memo whose words this relay did not touch keeps the bare update time, so
 * nothing already in a pool moves.
 */
function versionOf(
  updateTime: string,
  content: string | undefined,
  text: string | undefined,
): string {
  if (text === content) return updateTime;

  const digest = createHash("sha256")
    .update(text ?? "")
    .digest("hex")
    .slice(0, 16);
  return `${updateTime}/${digest}`;
}

/**
 * One memo as the pool takes it, or nothing where there is nothing to take:
 * core lets an empty capture through, and each relay guards its own input.
 *
 * Memos extracts a memo's `#tags` into `tags` itself, so the classification
 * arrives whether or not `hashtags` is set. What the flag decides is the
 * *prose*: with it, a foot of tags is classification and comes off; without it,
 * the content travels verbatim, `#tags` and all.
 */
export function relayedFrom(
  memo: Memo,
  open: Open,
  { hashtags }: Reading,
): Relayed | undefined {
  const attachments = (memo.attachments ?? []).map((attachment) => ({
    id: attachment.name,
    filename: attachment.filename,
    mime: attachment.type,
    open: (signal?: AbortSignal) => open(attachment, signal),
  }));

  const content = memo.content.trim() === "" ? undefined : memo.content;
  if (content === undefined && attachments.length === 0) return undefined;

  const { text, tags } = classified(content, memo.tags ?? [], hashtags);

  return {
    sourceItemId: uidOf(memo.name),
    version: versionOf(memo.updateTime, content, text),
    // The memo's own creation time, so a memo written three days ago sits three
    // days back in the feed rather than at the top of the poll that found it.
    capturedAt: memo.createTime,
    ...(text === undefined ? {} : { text }),
    tags,
    attachments,
  };
}
