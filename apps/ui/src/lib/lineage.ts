import { unprocessed, type Item } from "@notemap/client";

/**
 * The one word a row says about what became of it. Never more than one, so the
 * later fact wins: an archived revision reads as archived.
 */
export function became(item: Item): string | undefined {
  if (item.archived !== undefined) return "archived";
  if (item.revisedInto.length > 0) return "revised";
  if (item.routing !== undefined) return "routed";
  if (item.revisionOf !== undefined) return "revision";
  return undefined;
}

/** Finished: its prose is muted, so live captures stand out while scrolling. */
export function finished(item: Item): boolean {
  return item.archived !== undefined || item.revisedInto.length > 0;
}

/**
 * Whether the content is still a person's to change, which is the queue's own
 * rule: the row answers it, and no second read is needed.
 */
export const editable = unprocessed;
