import type { Item } from "@notemap/client";

/**
 * The one word a row says about what became of it. Never more than one, so the
 * later fact wins: an archived revision reads as archived.
 */
export function became(item: Item): string | undefined {
  if (item.archived !== undefined) return "archived";
  if (item.supersededBy !== undefined) return "superseded";
  if (item.routing !== undefined) return "routed";
  if (item.revisionOf !== undefined) return "revision";
  return undefined;
}

/** Finished: its prose is muted, so live captures stand out while scrolling. */
export function finished(item: Item): boolean {
  return item.archived !== undefined || item.supersededBy !== undefined;
}
