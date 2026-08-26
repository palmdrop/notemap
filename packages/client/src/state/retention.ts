import type { Item, ItemId } from "../api/types";
import { targetOf } from "../outbox/registry";
import { unprocessed, type ClientState } from "./state";

export const HISTORY = 500;

/** Touched, not captured: eviction does not go by `rank`. */
function oldestTouchedFirst(items: readonly Item[]): readonly Item[] {
  return [...items].sort((one, other) =>
    one.modifiedAt < other.modifiedAt ? -1 : 1,
  );
}

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
