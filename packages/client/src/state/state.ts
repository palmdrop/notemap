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

/**
 * Whether an item falls inside what a page has actually read. The pool's
 * position is `<at>,<id>` — the last row it handed over — so it answers this
 * exactly, and goes on answering it once every row in the window has left.
 */
function loaded(page: ListPage, item: Item): boolean {
  if (page.exhausted) return true;
  if (page.after === undefined) return false;

  const comma = page.after.indexOf(",");
  const at = comma === -1 ? page.after : page.after.slice(0, comma);
  const id = comma === -1 ? undefined : page.after.slice(comma + 1);

  const time = contentTime(item);
  return time === at ? id === undefined || item.id <= id : time < at;
}

/**
 * Places an item in the queue by its rank, and only where the list actually
 * reaches. Past that the pool's own next page carries it: appending to the end
 * of a window would sort it ahead of the older items still to be read.
 */
export function intoQueue(
  page: ListPage,
  id: ItemId,
  items: ReadonlyMap<ItemId, Item>,
): readonly ItemId[] {
  const inserted = items.get(id);
  if (inserted === undefined || page.ids.includes(id)) return page.ids;
  if (!loaded(page, inserted)) return page.ids;

  const rank = queueRank(inserted);

  const at = page.ids.findIndex((held) => {
    const item = items.get(held);
    return item !== undefined && queueRank(item) > rank;
  });

  return at === -1
    ? [...page.ids, id]
    : [...page.ids.slice(0, at), id, ...page.ids.slice(at)];
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
 * The pool has recorded a routing decision, so the item is out of the queue —
 * core derives processed as holding no routing record. It stays in the cache
 * and in the feed, which read everything.
 */
export function processed(state: ClientState, id: ItemId): ClientState {
  return {
    ...state,
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
    : intoQueue(state.queue, item.id, items);

  return { ...state, items, queue: withIds(state.queue, ids) };
}
