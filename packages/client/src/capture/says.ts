import type { Payload } from "#api/types";

/** The one place showing an item and editing it agree on where its text lives. */
const SLOT = "text";

export function saidIn(payload: Payload): string {
  const said = payload.content[SLOT];
  return typeof said === "string" ? said : "";
}

/** The capture's own words, changed. Never a **rewrite**, which belongs to one delivery. */
export function saidAs(payload: Payload, said: string): Payload {
  const { [SLOT]: _replaced, ...rest } = payload.content;

  return {
    ...payload,
    // Nothing said carries no key at all, as a capture with nothing said does.
    content: said.trim() === "" ? rest : { ...rest, [SLOT]: said },
  };
}
