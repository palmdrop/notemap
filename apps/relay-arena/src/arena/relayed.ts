import type { Attachment, Bytes, Relayed } from "@notemap/relay";

import type { ArenaBlock } from "./types";

/** How a block's file is reached, so the mapping needs no server. */
export type Open = (block: ArenaBlock, signal?: AbortSignal) => Promise<Bytes>;

function nonEmpty(text: string | undefined | null): string | undefined {
  const trimmed = (text ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Title, caption and source URL, each present or not, joined as paragraphs. */
function composed(parts: readonly (string | undefined)[]): string | undefined {
  const kept = parts.filter((part): part is string => part !== undefined);
  return kept.length === 0 ? undefined : kept.join("\n\n");
}

/**
 * A Text block's own prose verbatim; a Link or an Embed's title, caption and
 * source URL composed into prose — are.na never hosts an Embed's actual
 * media, only a cached thumbnail, so it is treated as a Link and carries no
 * attachment; an Image or Attachment's title and caption where it has them,
 * which may be nothing at all, since the file itself is the content.
 */
function textOf(block: ArenaBlock): string | undefined {
  switch (block.type) {
    case "Text":
      return nonEmpty(block.content?.markdown);
    case "Link":
    case "Embed":
      return composed([
        nonEmpty(block.title),
        nonEmpty(block.description?.markdown),
        nonEmpty(block.source?.url),
      ]);
    case "Image":
    case "Attachment":
      return composed([
        nonEmpty(block.title),
        nonEmpty(block.description?.markdown),
      ]);
    case "Channel":
      return undefined;
  }
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
    filename: file.filename,
    mime: file.content_type,
    open: (signal) => open(block, signal),
  };
}

/**
 * One block as the pool takes it, or nothing where there is nothing to take:
 * core lets an empty capture through, and each relay guards its own input. A
 * channel connected into a channel is not a note and is never captured.
 *
 * `tags` are the watched channel's configured tags and nothing else — are.na
 * has no tags on a block. They travel once, at capture, and are never
 * reconciled afterwards.
 */
export function relayedFrom(
  block: ArenaBlock,
  open: Open,
  tags: readonly string[],
): Relayed | undefined {
  if (block.type === "Channel") return undefined;

  const text = textOf(block);
  const attachment = attachmentOf(block, open);
  if (text === undefined && attachment === undefined) return undefined;

  return {
    sourceItemId: String(block.id),
    version: block.updated_at,
    // The moment the block was connected into *this* channel, not when it was
    // made — a block connected here may have been made by someone else years
    // earlier.
    capturedAt: block.connection.connected_at,
    ...(text === undefined ? {} : { text }),
    tags,
    attachments: attachment === undefined ? [] : [attachment],
  };
}
