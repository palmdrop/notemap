import type { Operation } from "@notemap/client";

import { excerptOf } from "./excerpt";

/** One piece of work this device holds, as the panel lists it: the deed, then the item it names. */
export type Outgoing = { readonly what: string; readonly item: string };

function textOf(content: unknown): string | undefined {
  if (typeof content !== "object" || content === null) return undefined;
  const text = (content as Record<string, unknown>)["text"];
  return typeof text === "string" ? text : undefined;
}

/** The shell's words for the deed, which are not always the operation's: archiving is `discard`. */
export function outgoing(operation: Operation): Outgoing {
  switch (operation.kind) {
    case "capture": {
      const said = excerptOf(textOf(operation.envelope.payload.content) ?? "");
      return {
        what: said === undefined ? "capture" : `capture · ${said}`,
        item: operation.envelope.id,
      };
    }
    case "archive":
      return { what: "discard", item: operation.item };
    case "unarchive":
      return { what: "unarchive", item: operation.item };
    case "edit":
      return { what: "edit", item: operation.item };
    case "tag":
      return { what: `tag · ${operation.tag}`, item: operation.item };
    case "untag":
      return { what: `untag · ${operation.tag}`, item: operation.item };
    case "accept-suggestion":
    case "reject-suggestion":
      return { what: "suggestion", item: operation.item };
  }
}
