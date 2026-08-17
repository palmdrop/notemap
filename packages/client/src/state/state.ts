import type { Item, ItemId } from "../api/types";
import type { PendingOperation } from "../outbox/operations";

export type ListPage = {
  readonly ids: readonly ItemId[];
  /** The position the next read continues from; absent once exhausted. */
  readonly after?: string;
  readonly exhausted: boolean;
  readonly loading: boolean;
  readonly failure?: string;
};

export type ClientState = {
  readonly items: ReadonlyMap<ItemId, Item>;
  readonly feed: ListPage;
  readonly queue: ListPage;
  readonly outbox: readonly PendingOperation[];
};

const EMPTY_PAGE: ListPage = { ids: [], exhausted: false, loading: false };

export function emptyState(): ClientState {
  return {
    items: new Map(),
    feed: EMPTY_PAGE,
    queue: EMPTY_PAGE,
    outbox: [],
  };
}

/** Last touch: where the queue reads an item, and what a revision moves. */
export function contentTime(item: Item): string {
  return item.contentUpdatedAt ?? item.createdAt;
}

/**
 * Ids never order two items — a revision carries its original's capture time
 * and mint order is not guaranteed — so an id only breaks a tie.
 */
export function queueRank(item: Item): string {
  return `${contentTime(item)}|${item.id}`;
}

export function insertOldestFirst(
  ids: readonly ItemId[],
  id: ItemId,
  items: ReadonlyMap<ItemId, Item>,
): readonly ItemId[] {
  const inserted = items.get(id);
  if (inserted === undefined || ids.includes(id)) return ids;

  const rank = queueRank(inserted);
  const at = ids.findIndex((held) => {
    const item = items.get(held);
    return item !== undefined && queueRank(item) > rank;
  });

  return at === -1 ? [...ids, id] : [...ids.slice(0, at), id, ...ids.slice(at)];
}

export function withIds(page: ListPage, ids: readonly ItemId[]): ListPage {
  return { ...page, ids };
}

export function without(ids: readonly ItemId[], id: ItemId): readonly ItemId[] {
  return ids.filter((held) => held !== id);
}

export function cached(
  state: ClientState,
  written: readonly Item[],
): ReadonlyMap<ItemId, Item> {
  const items = new Map(state.items);
  for (const item of written) items.set(item.id, item);
  return items;
}

/** Drops an item from the cache and from every list that named it. */
export function forget(state: ClientState, id: ItemId): ClientState {
  const items = new Map(state.items);
  items.delete(id);

  return {
    ...state,
    items,
    feed: withIds(state.feed, without(state.feed.ids, id)),
    queue: withIds(state.queue, without(state.queue.ids, id)),
  };
}

/**
 * Replaces the optimistic copy with what the pool recorded, and puts the item
 * on the right side of the queue: the pool decides whether it is still work.
 */
export function settle(state: ClientState, item: Item): ClientState {
  const items = cached(state, [item]);
  const ids = item.archived
    ? without(state.queue.ids, item.id)
    : insertOldestFirst(state.queue.ids, item.id, items);

  return { ...state, items, queue: withIds(state.queue, ids) };
}
