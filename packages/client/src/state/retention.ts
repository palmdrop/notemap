import type { Item, ItemId } from "../api/types";
import { targetOf } from "../outbox/registry";
import { unprocessed, type ClientState } from "./state";

/** How much feed history is kept beyond the working set. */
export const HISTORY = 500;

/** Touched, not captured: what a client last heard about is what it keeps. */
function oldestTouchedFirst(items: readonly Item[]): readonly Item[] {
  return [...items].sort((one, other) =>
    one.modifiedAt < other.modifiedAt ? -1 : 1,
  );
}

/**
 * Everything the client can see is unprocessed stays: it is the working set a
 * person triages against with the pool out of reach, and there is no useful
 * cap on it. So does anything an undrained operation is about, which is work
 * that has not landed, and anything a surface is currently drawing, which would
 * otherwise vanish under the reader. What is left is feed history, and it is
 * capped.
 */
export function retained(state: ClientState): ClientState {
  if (state.items.size <= HISTORY) return state;

  const drawn = new Set<ItemId>([
    ...state.feed.ids,
    ...state.queue.ids,
    ...state.outbox.map((held) => targetOf(held.operation)),
  ]);

  const history = [...state.items.values()].filter(
    (item) => !unprocessed(item) && !drawn.has(item.id),
  );
  if (history.length <= HISTORY) return state;

  const items = new Map(state.items);
  for (const evicted of oldestTouchedFirst(history).slice(
    0,
    history.length - HISTORY,
  )) {
    items.delete(evicted.id);
  }

  return { ...state, items };
}
