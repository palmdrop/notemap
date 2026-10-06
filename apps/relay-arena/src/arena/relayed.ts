import { createHash } from "node:crypto";

import { classified, tagFootOf } from "@notemap/relay";
import type { Attachment, Bytes, Relayed } from "@notemap/relay";

import { ARENA_CHANNEL_PAGE } from "../constants";
import type { ArenaBlock } from "./types";

/** How this relay was asked to read a block. */
export type Reading = {
  /** The watched channel's own tags, which every block from it arrives with. */
  readonly tags: readonly string[];
  /** Whether a foot of `#tags` is read as tags and taken off the prose. */
  readonly hashtags: boolean;
};

/** How a block's file is reached, so the mapping needs no server. */
export type Open = (block: ArenaBlock, signal?: AbortSignal) => Promise<Bytes>;

function nonEmpty(text: string | undefined | null): string | undefined {
  const trimmed = (text ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * The name a file was uploaded under, where the title still is that name:
 * are.na titles an upload with it until someone retitles it, and keeps only a
 * storage hash as the file's own `filename`.
 */
function uploadedAs(block: ArenaBlock): string | undefined {
  const title = nonEmpty(block.title);
  return title !== undefined && /^[^\s/\\]+\.[a-z0-9]{2,5}$/i.test(title)
    ? title
    : undefined;
}

function titleOf(block: ArenaBlock): string | undefined {
  const named = block.type === "Image" || block.type === "Attachment";
  if (named && uploadedAs(block) !== undefined) return undefined;
  return nonEmpty(block.title);
}

/** A Text block's own prose; every other class's caption, a channel's description included. */
function wordsOf(block: ArenaBlock): string | undefined {
  return nonEmpty(
    block.type === "Text"
      ? block.content?.markdown
      : block.description?.markdown,
  );
}

/**
 * Where the block points: a Link or Embed's page, the page an image or a text
 * was saved from, or a channel's own page on are.na.
 */
function linkOf(block: ArenaBlock): string | undefined {
  if (block.type !== "Channel") return nonEmpty(block.source?.url);
  const slug = nonEmpty(block.slug);
  return slug === undefined
    ? undefined
    : `${ARENA_CHANNEL_PAGE}/${encodeURIComponent(slug)}`;
}

/** Whether the words hold this URL whole, rather than as the start of a longer one. */
function holds(words: string | undefined, url: string): boolean {
  return (words?.match(/https?:\/\/[^\s<>()[\]"']+/g) ?? []).some(
    (found) => found.replace(/[.,;:!?]+$/, "") === url,
  );
}

/** Title, the block's own words and its link, each present or not, joined as paragraphs. */
function composed(parts: readonly (string | undefined)[]): string | undefined {
  const kept = parts.filter((part): part is string => part !== undefined);
  return kept.length === 0 ? undefined : kept.join("\n\n");
}

/**
 * An Image's stored image, or an Attachment's file. The id is composed and
 * fixed as `block/<id>/image` whatever the file actually is — a PDF included
 * — because the asset id is a UUIDv5 over it and must not move while the
 * block stands still.
 */
function attachmentOf(block: ArenaBlock, open: Open): Attachment | undefined {
  const file =
    block.type === "Image"
      ? block.image
      : block.type === "Attachment"
        ? block.attachment
        : undefined;
  if (file === undefined || file === null) return undefined;

  return {
    id: `block/${String(block.id)}/image`,
    filename: uploadedAs(block) ?? file.filename,
    mime: file.content_type,
    open: (signal) => open(block, signal),
  };
}

/**
 * What the block says, as a digest. are.na moves `updated_at` whenever a block
 * is connected into any channel, which is not an edit.
 */
function versionOf(
  text: string | undefined,
  attachment: Attachment | undefined,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        text ?? null,
        attachment === undefined
          ? null
          : [attachment.filename, attachment.mime],
      ]),
    )
    .digest("hex");
}

/**
 * One block as the pool takes it, or nothing where there is nothing to take:
 * core lets an empty capture through, and each relay guards its own input. A
 * channel connected into a channel arrives as a link to it, under an identity
 * of its own, since its id may be a block's as well.
 *
 * `tags` are the watched channel's configured tags, and — where `hashtags` asks
 * for it — the foot of tags the block's own words end with, which are.na has
 * nothing of its own to put there. The foot is read before the title and link
 * are composed around those words, so that it is still a foot. Tags travel
 * once, at capture, and are never reconciled afterwards.
 *
 * The version digests the prose the payload will carry, foot already off, so a
 * block whose foot alone was edited upstream is `already-captured` rather than
 * an edit of a payload that did not change.
 */
export function relayedFrom(
  block: ArenaBlock,
  open: Open,
  { tags: configured, hashtags }: Reading,
): Relayed | undefined {
  const words = wordsOf(block);
  const { text: read, tags } = classified(words, configured, hashtags);
  const title = titleOf(block);
  const link = linkOf(block);
  const attachment = attachmentOf(block, open);

  // `classified` keeps words that are only a foot so the capture is not empty;
  // a title, link or file around them already keeps it from being empty.
  const onlyFoot =
    hashtags && words !== undefined && tagFootOf(words).prose === "";
  const own =
    onlyFoot &&
    (title !== undefined || link !== undefined || attachment !== undefined)
      ? undefined
      : read;

  const text = composed([
    title,
    own,
    link !== undefined && holds(own, link) ? undefined : link,
  ]);
  if (text === undefined && attachment === undefined) return undefined;

  return {
    sourceItemId:
      block.type === "Channel"
        ? `channel/${String(block.id)}`
        : String(block.id),
    version: versionOf(text, attachment),
    // The moment the block was connected into *this* channel, not when it was
    // made — a block connected here may have been made by someone else years
    // earlier.
    capturedAt: block.connection.connected_at,
    ...(text === undefined ? {} : { text }),
    tags,
    attachments: attachment === undefined ? [] : [attachment],
  };
}
