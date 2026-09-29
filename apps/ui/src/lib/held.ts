import { rank, type Item, type Order } from "@notemap/client";

/**
 * Where a list's order puts a selected row it no longer holds: a surface
 * arrived at with the row already gone never drew it anywhere to stand.
 */
export function placeOf(
  live: readonly Item[],
  kept: Item,
  order: Order,
): number {
  const at = rank(kept);
  const after = live.findIndex((row) =>
    order === "oldest-first" ? rank(row) > at : rank(row) < at,
  );
  return after === -1 ? live.length : after;
}
