import { relative, sep } from "node:path";

import type { Renderer, Renderers } from "@notemap/mirror-fs";
import type { Asset, BlobHash, PayloadTypeName } from "@notemap/core";

/**
 * The prose of a `text` capture, as itself. Deliberately lossy — it drops the
 * metadata and the artifacts the record beside it carries — because nothing
 * ever parses this file and a person reading it wants the note, not a dump.
 */
const renderText: Renderer = (record) => {
  const text = record.item.payload.content["text"];
  return { body: `${typeof text === "string" ? text : ""}\n` };
};

/**
 * An image, pointed at the blob itself rather than at a copy: `assets/` is
 * shared, and the mirror writes no bytes of its own. The path scheme is the
 * blob driver's, so it is asked rather than reproduced.
 *
 * Accepted, and the reason the alt text is the filename: a blob file has no
 * extension and is named for a machine, so a person reading the `.md` without
 * notemap needs the record — or this line — to learn what the bytes were called.
 */
function renderImage(pathFor: (blob: BlobHash) => string): Renderer {
  return (record, at) => {
    const byId = new Map(record.assets.map((asset) => [asset.id, asset]));

    const images = record.item.payload.assets
      .map((ref) => byId.get(ref.asset))
      .filter((asset): asset is Asset => asset !== undefined)
      .map(
        (asset) =>
          `![${asset.filename}](${link(at.directory, pathFor(asset.blob))})`,
      );

    const caption = record.item.payload.content["caption"];
    const lines =
      typeof caption === "string" && caption !== ""
        ? [...images, "", caption]
        : images;

    return { body: `${lines.join("\n")}\n` };
  };
}

/** Relative, and in URL separators, so the link works from a text file on any platform. */
function link(directory: string, target: string): string {
  return relative(directory, target).split(sep).join("/");
}

export function renderersFor(pathFor: (blob: BlobHash) => string): Renderers {
  return {
    ["text" as PayloadTypeName]: renderText,
    ["image" as PayloadTypeName]: renderImage(pathFor),
  };
}
