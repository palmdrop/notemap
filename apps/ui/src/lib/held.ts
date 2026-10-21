import { rank, type Item, type Key, type Order } from "@notemap/client";

/**
 * Where a list's order puts a selected row it no longer holds: a surface
 * arrived at with the row already gone never drew it anywhere to stand.
 */
export function placeOf(
  live: readonly Item[],
  kept: Item,
  order: Order,
  by: Key = "capture",
): number {
  const at = rank(kept, by);
  const after = live.findIndex((row) =>
    order === "oldest-first" ? rank(row, by) > at : rank(row, by) < at,
  );
  return after === -1 ? live.length : after;
}
