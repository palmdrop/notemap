import type { ActionKind } from "@notemap/client";

/**
 * What a kind of action is called on a row. The pool's names are the wire's —
 * hyphenated, and saying `archived` where the shell says discard — and a row's
 * heading is read by a person, so the hyphen is a space and the archive is
 * called what the UI calls it everywhere else.
 */
const SAID: Readonly<Record<string, string>> = {
  archived: "discarded",
  unarchived: "undiscarded",
};

export function kindWord(kind: string): string {
  return SAID[kind] ?? kind.replaceAll("-", " ");
}

/**
 * A route waiting out its window is in flight on the status line, and ends as a
 * landing or a cancellation, which is the row that stays.
 */
export const UNDRAWN = [
  "delivery-held",
  "template-fired",
] as const satisfies readonly ActionKind[];

export function drawable(kind: ActionKind): boolean {
  return !(UNDRAWN as readonly ActionKind[]).includes(kind);
}
