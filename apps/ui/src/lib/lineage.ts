import { unprocessed, type Item } from "@notemap/client";

/**
 * The one word a row says about what became of it. Never more than one, so the
 * later fact wins: an archived revision reads as discarded.
 *
 * A routing says which of three it is, because `routed` alone would name a
 * carrier there never was for a mark made by hand, and would claim a delivery
 * the pool has recorded and not yet carried out.
 */
export function became(item: Item): string | undefined {
  if (item.archived !== undefined) return "discarded";
  if (item.revisedInto.length > 0) return "revised";
  if (item.routing !== undefined) return wentHow(item.routing);
  if (item.revisionOf !== undefined) return "revision";
  return undefined;
}

function wentHow(routing: NonNullable<Item["routing"]>): string {
  const byHand =
    routing.to.length > 0 && routing.to.every((went) => went.kind === "user");

  if (byHand) return "manual";
  return routing.pending > 0 ? "retrying" : "routed";
}

/** Finished: its prose is muted, so live captures stand out while scrolling. */
export function finished(item: Item): boolean {
  return item.archived !== undefined || item.revisedInto.length > 0;
}

/** The queue's own rule, which the row answers without a second read. */
export const editable = unprocessed;
