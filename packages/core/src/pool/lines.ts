import { canonicalPayload, samePayload } from "./payload";
import type { PoolReads } from "#types/api/ports";
import type { SourceId } from "#types/domain/ids";
import type { Item } from "#types/domain/item";
import type { Payload } from "#types/domain/payload";

/** What a re-read of `item`'s line resolves to: its latest revision, then its continuation, followed to the end. */
export async function headOf(reads: PoolReads, item: Item): Promise<Item> {
  let head = item;
  for (;;) {
    const latest = head.revisedInto.at(-1);
    const next =
      latest === undefined
        ? await reads.continuationOf(head.id)
        : await reads.item(latest);
    if (next === undefined) return head;
    head = next;
  }
}

/** A revision is made by whoever edited, so the line's source is the one its first item came from. */
export async function lineSourceOf(
  reads: PoolReads,
  item: Item,
): Promise<SourceId> {
  let first = item;
  while (first.revisionOf !== undefined) {
    const before = await reads.item(first.revisionOf);
    if (before === undefined) return first.source;
    first = before;
  }
  return first.source;
}

/** What the line's source last said for an item. */
export function sourceWordOf(item: Item): Payload {
  return item.sourceWord ?? item.payload;
}

/**
 * The source's word an item keeps once it says `payload`: none where the
 * source said it, or where it says the source's word again.
 */
export function keptWord(
  item: Item,
  payload: Payload,
  bySource: boolean,
): Payload | undefined {
  if (bySource) return undefined;
  const word = sourceWordOf(item);
  return samePayload(word, payload) ? undefined : canonicalPayload(word);
}
