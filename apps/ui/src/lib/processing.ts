import type { Item } from "@notemap/client";

/**
 * The two answers to *what became of this* that no destination gives. Neither
 * is pool state: `manual` is routing whose destination is the person, which the
 * pool records but never lists, and `discard` is archiving, which is not a
 * delivery at all. Both are entries this shell invents, which is why they sit
 * in a band of their own.
 */
export const MANUAL = "manual";
export const DISCARD = "discard";

export type ByHand = typeof MANUAL | typeof DISCARD;

export function byHand(id: string): id is ByHand {
  return id === MANUAL || id === DISCARD;
}

/** What a `where` entry needs to be taken, which is less than a destination is. */
export type Takeable = {
  readonly id: string;
  readonly name: string;
  readonly retired?: boolean;
};

/**
 * Marking processed is routing whose destination is the person, so an item
 * whose summary already names them has been marked. The summary is on every
 * row; the records are not.
 */
export function marked(item: Item): boolean {
  return item.routing?.to.some((went) => went.kind === "user") === true;
}

/** Why one of the two cannot be taken, or nothing where it can. */
export function refusalFor(
  id: ByHand,
  item: Item,
  offline: boolean,
): string | undefined {
  if (id === DISCARD) {
    return item.archived === undefined ? undefined : "already discarded";
  }

  if (marked(item)) return "already marked";
  return offline ? "pool out of reach" : undefined;
}

export const HAND: readonly Takeable[] = [
  { id: MANUAL, name: MANUAL },
  { id: DISCARD, name: DISCARD },
];
