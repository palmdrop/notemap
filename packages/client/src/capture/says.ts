import type { Payload } from "../api/types";

const IMAGE = "image";

/** The one place showing an item and editing it agree on where its text lives. */
function slotOf(payload: Payload): "text" | "caption" {
  return payload.type === IMAGE ? "caption" : "text";
}

export function saidIn(payload: Payload): string {
  const said = payload.content[slotOf(payload)];
  return typeof said === "string" ? said : "";
}

export function rewritten(payload: Payload, said: string): Payload {
  const slot = slotOf(payload);
  const { [slot]: _replaced, ...rest } = payload.content;

  return {
    ...payload,
    // An image with nothing said carries no key at all, as its capture does.
    content:
      slot === "caption" && said.trim() === ""
        ? rest
        : { ...rest, [slot]: said },
  };
}
