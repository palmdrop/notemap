import { relative, sep } from "node:path";

import type { Renderer, Renderers } from "@notemap/mirror-fs";
import type { Asset, BlobHash, PayloadTypeName } from "@notemap/core";

/**
 * A note as itself: its attachments in slot order, then its prose. Deliberately
 * lossy — it drops the metadata and the artifacts the record beside it carries
 * — because nothing ever parses this file and a person reading it wants the
 * note.
 *
 * Points at the blob itself rather than a copy: `assets/` is shared and the
 * mirror writes no bytes of its own. The alt text is the filename because a
 * blob file has no extension and is named for a machine.
 */
function renderNote(pathFor: (blob: BlobHash) => string): Renderer {
  return (record, at) => {
    const byId = new Map(record.assets.map((asset) => [asset.id, asset]));

    const attachments = [...record.item.payload.assets]
      .sort((left, right) => (left.slot < right.slot ? -1 : 1))
      .map((ref) => byId.get(ref.asset))
      .filter((asset): asset is Asset => asset !== undefined)
      .map((asset) => {
        const target = link(at.directory, pathFor(asset.blob));
        return `${asset.mime.startsWith("image/") ? "!" : ""}[${asset.filename}](${target})`;
      });

    const text = record.item.payload.content["text"];
    const lines =
      typeof text === "string" && text !== ""
        ? [...attachments, ...(attachments.length > 0 ? [""] : []), text]
        : attachments;

    return { body: `${lines.join("\n")}\n` };
  };
}

/** Relative, and in URL separators, so the link works from a text file on any platform. */
function link(directory: string, target: string): string {
  return relative(directory, target).split(sep).join("/");
}

export function renderersFor(pathFor: (blob: BlobHash) => string): Renderers {
  return { ["note" as PayloadTypeName]: renderNote(pathFor) };
}
