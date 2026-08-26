import type {
  Destination,
  DestinationId,
  Item,
  ItemId,
  PoolIdentity,
  RoutingRecord,
  RoutingSummary,
  TagUse,
} from "../api/types";
import type { PendingOperation } from "../outbox/operations";
import type { Order, ReadFailure } from "../types";

type RoutedTo = RoutingSummary["to"][number];

export type Surface = "feed" | "queue";

export type ListPage = {
  readonly order: Order;
  readonly ids: readonly ItemId[];
  /** The position the next read continues from; absent once exhausted. */
  readonly after?: string;
  readonly exhausted: boolean;
  readonly loading: boolean;
  /**
   * Whether the rows this page holds came from the pool. A turn keeps the claim
   * while it reads, and gives it up if that read fails: the surface is the
   * client's own again the moment it holds nothing the pool gave it.
   */
  readonly answered: boolean;
  readonly failure?: ReadFailure;
};

export type ClientState = {
  readonly items: ReadonlyMap<ItemId, Item>;
  readonly feed: ListPage;
  readonly queue: ListPage;
  readonly outbox: readonly PendingOperation[];
  /** In the order the pool answered, for a screen to read once it is out of reach. */
  readonly destinations: readonly Destination[];
  /** What completion offers, most used first, as the pool last counted it. */
  readonly tags: readonly TagUse[];
  readonly pool?: PoolIdentity;
};

export function emptyPage(order: Order): ListPage {
  return { order, ids: [], exhausted: false, loading: false, answered: false };
}

export function emptyState(): ClientState {
  return {
    items: new Map(),
    feed: emptyPage("newest-first"),
    queue: emptyPage("oldest-first"),
    outbox: [],
    destinations: [],
    tags: [],
  };
}

export function rebuilt(state: ClientState, pool: PoolIdentity): ClientState {
  return {
    ...state,
    pool,
    items: new Map(),
    feed: emptyPage(state.feed.order),
    queue: emptyPage(state.queue.order),
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

/**
 * Where every surface reads an item: its capture time, with the id only to
 * break a tie, since mint order is not guaranteed to follow it.
 */
export function rank(item: Item): string {
  return `${item.createdAt}|${item.id}`;
}

/**
 * Whether an item is the queue's, which is the same question as whether it is
 * a person's to edit. Named once because the shell, the settlement and the
 * cache all ask it, and a second copy of it would drift.
 */
export function unprocessed(item: Item): boolean {
  return (
    item.archived === undefined &&
    item.routing === undefined &&
    item.revisedInto.length === 0
  );
}

/** Whether one rank sorts later than another in the order a page is being read. */
function behind(order: Order, one: string, other: string): boolean {
  return order === "oldest-first" ? one > other : one < other;
}

/** No rows, no position, no end: nothing an arrival could be placed into. */
export function unpositioned(page: ListPage): boolean {
  return page.ids.length === 0 && page.after === undefined && !page.exhausted;
}

/** Whether a surface draws itself rather than the page the pool answered for it. */
export function fromCache(page: ListPage): boolean {
  return !page.answered;
}

export function drawnFrom(
  state: ClientState,
  surface: Surface,
): readonly Item[] {
  const { order } = state[surface];
  const held = [...state.items.values()].filter(
    (item) => surface === "feed" || unprocessed(item),
  );

  return held.sort((one, other) =>
    behind(order, rank(one), rank(other)) ? 1 : -1,
  );
}

/**
 * Whether an item falls inside what a page has actually read. The pool's
 * position is `<at>,<id>` — the last row it handed over — so it answers this
 * exactly, and goes on answering it once every row in the window has left.
 */
function loaded(page: ListPage, item: Item): boolean {
  if (page.exhausted) return true;

  // Nothing read yet, so the window is the order's own start. An arrival is at
  // that boundary reading newest-first and past the far end reading
  // oldest-first, where the pool's first page is what carries it.
  if (page.after === undefined) return page.order === "newest-first";

  const comma = page.after.indexOf(",");
  const at = comma === -1 ? page.after : page.after.slice(0, comma);
  const id = comma === -1 ? undefined : page.after.slice(comma + 1);

  const time = item.createdAt;
  if (time === at) return id === undefined || !behind(page.order, item.id, id);
  return behind(page.order, at, time);
}

/**
 * Places an item on a surface by its rank, and only where the page actually
 * reaches. Past that the pool's own next page carries it: appending to the end
 * of a window would sort it ahead of the rows still to be read.
 */
export function intoPage(
  page: ListPage,
  id: ItemId,
  items: ReadonlyMap<ItemId, Item>,
): readonly ItemId[] {
  // Nothing to place into a page with no window: either the cache draws the
  // surface and already holds this, or a read is about to replace it wholesale.
  if (unpositioned(page)) return page.ids;

  const inserted = items.get(id);
  if (inserted === undefined || page.ids.includes(id)) return page.ids;
  if (!loaded(page, inserted)) return page.ids;

  const arriving = rank(inserted);

  const at = page.ids.findIndex((held) => {
    const item = items.get(held);
    return item !== undefined && behind(page.order, rank(item), arriving);
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

function wentTo(record: RoutingRecord): RoutedTo {
  return record.target.kind === "destination"
    ? { kind: "destination", destination: record.target.destination }
    : { kind: "user" };
}

/** Distinct, in the order the records were made, as the pool answers it. */
function targets(
  held: readonly RoutedTo[],
  arriving: readonly RoutedTo[],
): RoutedTo[] {
  const merged = [...held];
  for (const went of arriving) {
    const already = merged.some((each) =>
      went.kind === "destination"
        ? each.kind === "destination" && each.destination === went.destination
        : each.kind === "user",
    );
    if (!already) merged.push(went);
  }
  return merged;
}

/** What the pool would answer for these records, so a re-read changes nothing. */
export function summarise(
  records: readonly RoutingRecord[],
): RoutingSummary | undefined {
  if (records.length === 0) return undefined;

  return {
    records: records.length,
    pending: records.filter((record) => record.state === "pending").length,
    to: targets([], records.map(wentTo)),
  };
}

function withRouting(
  state: ClientState,
  id: ItemId,
  routing: RoutingSummary | undefined,
): ReadonlyMap<ItemId, Item> {
  const item = state.items.get(id);
  if (item === undefined) return state.items;

  const { routing: _held, ...rest } = item;
  return cached(state, [
    { ...rest, ...(routing === undefined ? {} : { routing }) },
  ]);
}

/**
 * The pool has recorded a routing decision, so the item is out of the queue —
 * core derives processed as holding no routing record. Folded into the held
 * copy rather than read back, which leaves one thing unobserved: a record that
 * answered pending and landed later still reads as pending until some surface
 * reads the item again.
 */
export function processed(
  state: ClientState,
  id: ItemId,
  record: RoutingRecord,
): ClientState {
  const held = state.items.get(id)?.routing;

  return {
    ...state,
    items: withRouting(state, id, {
      records: (held?.records ?? 0) + 1,
      pending: (held?.pending ?? 0) + (record.state === "pending" ? 1 : 0),
      to: targets(held?.to ?? [], [wentTo(record)]),
    }),
    queue: withIds(state.queue, without(state.queue.ids, id)),
  };
}

/**
 * A withdrawn decision leaves the pool's remaining records, and an item holding
 * none is work again — back at the content time it left with rather than at the
 * newest end, which is core's third kind of queue event.
 */
export function withdrawn(
  state: ClientState,
  id: ItemId,
  records: readonly RoutingRecord[],
): ClientState {
  const held = { ...state, items: withRouting(state, id, summarise(records)) };
  if (records.length > 0) return held;

  return {
    ...held,
    queue: withIds(held.queue, intoPage(held.queue, id, held.items)),
  };
}

/**
 * An item that has just been captured, placed on both surfaces by its rank and
 * only where the page reaches: they read the same key in either direction, so
 * the newest arrival is at the head of one and past the end of the other.
 */
export function arrived(state: ClientState, item: Item): ClientState {
  const items = cached(state, [item]);

  return {
    ...state,
    items,
    feed: withIds(state.feed, intoPage(state.feed, item.id, items)),
    queue: withIds(state.queue, intoPage(state.queue, item.id, items)),
  };
}

/** The item it came from leaves the queue processed, not pointed at. */
export function revised(
  state: ClientState,
  revisionOf: ItemId,
  revision: Item,
): ClientState {
  const from = state.items.get(revisionOf);
  const held =
    from === undefined
      ? state
      : {
          ...state,
          items: cached(state, [
            { ...from, revisedInto: [...from.revisedInto, revision.id] },
          ]),
          queue: withIds(state.queue, without(state.queue.ids, revisionOf)),
        };

  return arrived(held, revision);
}

/**
 * Replaces the optimistic copy with what the pool recorded, and puts the item
 * on the right side of the queue: the pool decides whether it is still work.
 * Nothing re-ranks it — the key is capture time, which no mutation moves — so
 * an item that is still the queue's keeps the place it was drawn in.
 */
export function settle(state: ClientState, item: Item): ClientState {
  const items = cached(state, [item]);
  const held = state.queue.ids.includes(item.id);
  const drained = withIds(state.queue, without(state.queue.ids, item.id));
  const ids = !unprocessed(item)
    ? drained.ids
    : held
      ? state.queue.ids
      : intoPage(drained, item.id, items);

  return { ...state, items, queue: withIds(state.queue, ids) };
}
