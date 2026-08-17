import type { Payload } from "../api/types";

const IMAGE = "image";

/**
 * Which key of a payload's content holds the words a person reads and writes.
 * The one place the two directions agree: showing an item and editing it would
 * otherwise be free to disagree about where its text lives.
 */
function slotOf(payload: Payload): "text" | "caption" {
  return payload.type === IMAGE ? "caption" : "text";
}

export function saidIn(payload: Payload): string {
  const said = payload.content[slotOf(payload)];
  return typeof said === "string" ? said : "";
}

/** The same payload with new words in it, and nothing else disturbed. */
export function rewritten(payload: Payload, said: string): Payload {
  const slot = slotOf(payload);
  const { [slot]: _replaced, ...rest } = payload.content;

  return {
    ...payload,
    // An image with nothing said about it carries no key at all, the way the
    // capture that made it does.
    content:
      slot === "caption" && said.trim() === ""
        ? rest
        : { ...rest, [slot]: said },
  };
}
