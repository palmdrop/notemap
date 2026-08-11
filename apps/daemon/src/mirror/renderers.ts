import type { Renderer, Renderers } from "@notemap/mirror-fs";
import type { PayloadTypeName } from "@notemap/core";

/**
 * The prose of a `text` capture, as itself. Deliberately lossy — it drops the
 * metadata and the artifacts the record beside it carries — because nothing
 * ever parses this file and a person reading it wants the note, not a dump.
 */
const renderText: Renderer = (record) => {
  const text = record.item.payload.content["text"];
  return { body: `${typeof text === "string" ? text : ""}\n` };
};

export const RENDERERS: Renderers = {
  ["text" as PayloadTypeName]: renderText,
};
