import { unprocessed, type Item } from "@notemap/client";

/**
 * The one word a row says about what became of it. Never more than one, so the
 * later fact wins: an archived revision reads as discarded. Where an item was
 * routed there is no word: the line saying where it went is the mark.
 */
export function became(item: Item): string | undefined {
  if (item.archived !== undefined) return "discarded";
  if (item.revisedInto.length > 0) return "revised";
  if (item.revisionOf !== undefined) return "revision";
  return undefined;
}

/** The queue's own rule, which the row answers without a second read. */
export const editable = unprocessed;
