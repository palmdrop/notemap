import type { Destination, DestinationId, Item, ItemId } from "../api/types";
import type { PendingOperation } from "../outbox/operations";
import type { Order } from "../types";

export type ListPage = {
  readonly order: Order;
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
  /** Held for display in the order the pool answered: a settings screen reads while offline. */
  readonly destinations: readonly Destination[];
};

export function emptyPage(order: Order): ListPage {
  return { order, ids: [], exhausted: false, loading: false };
}

export function emptyState(): ClientState {
  return {
    items: new Map(),
    feed: emptyPage("newest-first"),
    queue: emptyPage("oldest-first"),
    outbox: [],
    destinations: [],
  };
}

/** One destination replaced where it stood, appended where it is new, or dropped. */
export function settledDestination(
  state: ClientState,
  id: DestinationId,
  held: Destination | undefined,
): ClientState {
  if (held === undefined) {
    return {
      ...state,
      destinations: state.destinations.filter((each) => each.id !== id),
    };
  }

  const at = state.destinations.findIndex((each) => each.id === id);
  return {
    ...state,
    destinations:
      at === -1
        ? [...state.destinations, held]
        : state.destinations.with(at, held),
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

/** Whether one rank sorts later than another in the order a page is being read. */
function behind(order: Order, one: string, other: string): boolean {
  return order === "oldest-first" ? one > other : one < other;
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
  if (time === at) return id === undefined || !behind(page.order, item.id, id);
  return behind(page.order, at, time);
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
    return item !== undefined && behind(page.order, queueRank(item), rank);
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
 * A withdrawn decision puts the item back at the content time it left with,
 * rather than at the newest end — core's third kind of queue event.
 */
export function returned(state: ClientState, id: ItemId): ClientState {
  return {
    ...state,
    queue: withIds(state.queue, intoQueue(state.queue, id, state.items)),
  };
}

/**
 * Places a revision beside the item it supersedes, rather than at either end.
 * The feed reads newest first and a revision carries its original's capture
 * time, so the two tie and the revision sits immediately ahead of it; the
 * original leaves the queue superseded and the revision takes its place there
 * by rank.
 */
export function revised(
  state: ClientState,
  supersedes: ItemId,
  revision: Item,
): ClientState {
  const original = state.items.get(supersedes);
  const items = cached(state, [
    ...(original === undefined
      ? []
      : [{ ...original, supersededBy: revision.id }]),
    revision,
  ]);

  const at = state.feed.ids.indexOf(supersedes);
  const feed =
    at === -1 || state.feed.ids.includes(revision.id)
      ? state.feed.ids
      : [
          ...state.feed.ids.slice(0, at),
          revision.id,
          ...state.feed.ids.slice(at),
        ];

  const drained = withIds(state.queue, without(state.queue.ids, supersedes));

  return {
    ...state,
    items,
    feed: withIds(state.feed, feed),
    queue: withIds(drained, intoQueue(drained, revision.id, items)),
  };
}

/**
 * Replaces the optimistic copy with what the pool recorded, and puts the item
 * on the right side of the queue: the pool decides whether it is still work.
 * Re-ranked rather than left where it was, because an amendment moves an item
 * to the newest end — which may be past what this page has read, and the pool's
 * next page is then what carries it.
 */
export function settle(state: ClientState, item: Item): ClientState {
  const items = cached(state, [item]);
  const drained = withIds(state.queue, without(state.queue.ids, item.id));
  const ids =
    item.archived !== undefined || item.supersededBy !== undefined
      ? drained.ids
      : intoQueue(drained, item.id, items);

  return { ...state, items, queue: withIds(state.queue, ids) };
}
