import type {
  Action,
  Agent,
  AssetId,
  Destination,
  DestinationId,
  Item,
  ItemId,
  PoolIdentity,
  PoolSetting,
  RoutingRecord,
  RoutingSummary,
  RoutingTemplate,
  RoutingTemplateId,
  Tag,
  TagUse,
} from "#api/types";
import type { PendingOperation } from "#outbox/operations";
import type { Order, ReadFailure } from "../types";

type RoutedTo = RoutingSummary["to"][number];

export type Surface = "feed" | "queue";

/** Tags every item on a page carries. Empty is the whole surface. */
export type Filter = readonly string[];

export type ListPage = {
  readonly order: Order;
  /** Absent on the whole surface. */
  readonly filter?: Filter;
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
  /**
   * The page a surface is read through while a filter is on it. The whole page
   * is kept beside it rather than replaced, so lifting the filter goes back to
   * where the reader was.
   */
  readonly filtered: { readonly [surface in Surface]?: ListPage };
  readonly outbox: readonly PendingOperation[];
  /** In the order the pool answered, for a screen to read once it is out of reach. */
  readonly destinations: readonly Destination[];
  /** The same, for templates: a saved decision is offered while the pool is away. */
  readonly templates: readonly RoutingTemplate[];
  /** Absent until read from the pool, never filled with a default. */
  readonly poolSettings?: readonly PoolSetting[];
  /** What completion offers, most used first, as the pool last counted it. */
  readonly tags: readonly TagUse[];
  /**
   * What the store still holds, per asset. Remembered rather than asked for, so
   * what an item's pictures are stays a question with an answer rather than a
   * promise — and it is the only thing that knows, for a capture the pool has
   * not answered yet.
   */
  readonly held: ReadonlyMap<AssetId, HeldBlob>;
  readonly pool?: PoolIdentity;
};

/** A shell that cannot make a URL for its own bytes still knows what they are. */
export type HeldBlob = {
  readonly mime: string;
  readonly filename: string;
  readonly bytes: number;
  readonly url?: string;
};

export function emptyPage(order: Order, filter: Filter = []): ListPage {
  return {
    order,
    ...(filter.length === 0 ? {} : { filter }),
    ids: [],
    exhausted: false,
    loading: false,
    answered: false,
  };
}

/** Trimmed as the pool trims, blanks dropped, one of each, in the order named. */
export function filterOf(tags: readonly string[]): Filter {
  const kept: string[] = [];
  for (const tag of tags.map((each) => each.trim())) {
    if (tag !== "" && !kept.includes(tag)) kept.push(tag);
  }
  return kept;
}

export function sameFilter(one: Filter = [], other: Filter = []): boolean {
  return (
    one.length === other.length && one.every((tag, at) => tag === other[at])
  );
}

/** The page a surface is being read through: the filtered one where there is one. */
export function reading(state: ClientState, surface: Surface): ListPage {
  return state.filtered[surface] ?? state[surface];
}

/** Written to the whole page or the filtered one, by the filter the page carries. */
export function withReading(
  state: ClientState,
  surface: Surface,
  page: ListPage,
): ClientState {
  return (page.filter ?? []).length === 0
    ? { ...state, [surface]: page }
    : { ...state, filtered: { ...state.filtered, [surface]: page } };
}

/** The surface read whole again, its filtered page dropped. */
export function unfiltered(state: ClientState, surface: Surface): ClientState {
  if (state.filtered[surface] === undefined) return state;
  const { [surface]: _dropped, ...rest } = state.filtered;
  return { ...state, filtered: rest };
}

export function emptyState(): ClientState {
  return {
    items: new Map(),
    feed: emptyPage("newest-first"),
    queue: emptyPage("oldest-first"),
    filtered: {},
    outbox: [],
    destinations: [],
    templates: [],
    tags: [],
    held: new Map(),
  };
}

export function withHeld(
  state: ClientState,
  asset: AssetId,
  blob: HeldBlob | undefined,
): ClientState {
  const held = new Map(state.held);
  if (blob === undefined) held.delete(asset);
  else held.set(asset, blob);

  return { ...state, held };
}

/** Each filtered page emptied, still read through its filter: the address still names it. */
function startedOver(
  filtered: ClientState["filtered"],
): ClientState["filtered"] {
  const kept: { [surface in Surface]?: ListPage } = {};
  for (const surface of ["feed", "queue"] as const) {
    const page = filtered[surface];
    if (page !== undefined) kept[surface] = emptyPage(page.order, page.filter);
  }
  return kept;
}

export function rebuilt(state: ClientState, pool: PoolIdentity): ClientState {
  const { poolSettings: _poolSettings, ...rest } = state;
  return {
    ...rest,
    pool,
    items: new Map(),
    feed: emptyPage(state.feed.order),
    queue: emptyPage(state.queue.order),
    filtered: startedOver(state.filtered),
  };
}

/**
 * Everything drawn from the pool, dropped — for signing out, which is the same
 * rule a changed pool identity follows and for the same reason: what is held
 * describes somewhere the holder can no longer speak for.
 *
 * The outbox is not in it. Unsent work is the person's own, not the pool's, and
 * it drains when someone signs in again.
 */
export function forgotten(state: ClientState): ClientState {
  const { poolSettings: _poolSettings, ...rest } = state;
  return {
    ...rest,
    items: new Map(),
    feed: emptyPage(state.feed.order),
    queue: emptyPage(state.queue.order),
    filtered: startedOver(state.filtered),
    destinations: [],
    templates: [],
    tags: [],
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

/** One template replaced where it stood, appended where it is new, or dropped. */
export function settledTemplate(
  state: ClientState,
  id: RoutingTemplateId,
  held: RoutingTemplate | undefined,
): ClientState {
  if (held === undefined) {
    return {
      ...state,
      templates: state.templates.filter((each) => each.id !== id),
    };
  }

  const at = state.templates.findIndex((each) => each.id === id);
  return {
    ...state,
    templates:
      at === -1 ? [...state.templates, held] : state.templates.with(at, held),
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

function carries(item: Item, filter: Filter = []): boolean {
  const tags = item.tags ?? [];
  return filter.every((name) => tags.some((held) => held.name === name));
}

/**
 * Whether an item is a page's to hold: the surface's own condition, and every
 * tag the page is filtered by. The one rule every page is kept by.
 */
export function belongs(surface: Surface, page: ListPage, item: Item): boolean {
  return (
    (surface === "feed" || unprocessed(item)) && carries(item, page.filter)
  );
}

/** Every page the state holds, whole and filtered, rewritten by one function. */
function eachPage(
  state: ClientState,
  change: (surface: Surface, page: ListPage) => ListPage,
): ClientState {
  const filtered: { [surface in Surface]?: ListPage } = {};
  for (const surface of ["feed", "queue"] as const) {
    const page = state.filtered[surface];
    if (page !== undefined) filtered[surface] = change(surface, page);
  }

  return {
    ...state,
    feed: change("feed", state.feed),
    queue: change("queue", state.queue),
    filtered,
  };
}

/** The item off every page of one surface, or of both. */
export function leaving(
  state: ClientState,
  id: ItemId,
  only?: Surface,
): ClientState {
  return eachPage(state, (surface, page) =>
    (only === undefined || surface === only) && page.ids.includes(id)
      ? withIds(page, without(page.ids, id))
      : page,
  );
}

/**
 * The held copy of an item put where it belongs: off every page it no longer
 * belongs on, and onto every one it does where the page reaches. A page that
 * already holds it keeps it where it was drawn.
 */
export function reconciled(state: ClientState, id: ItemId): ClientState {
  const item = state.items.get(id);
  if (item === undefined) return state;

  return eachPage(state, (surface, page) => {
    const held = page.ids.includes(id);
    if (!belongs(surface, page, item)) {
      return held ? withIds(page, without(page.ids, id)) : page;
    }
    if (held) return page;

    const ids = intoPage(page, id, state.items);
    return ids === page.ids ? page : withIds(page, ids);
  });
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
  const page = reading(state, surface);
  const { order } = page;
  const held = [...state.items.values()].filter((item) =>
    belongs(surface, page, item),
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

/**
 * A surface read again from its start, joined to the tail that was already
 * walked. The fresh page answers for its own window and for nothing past it, so
 * a row inside that window the pool no longer names has left, and one below it
 * is the tail's — kept, since a first page says nothing about a fifth.
 *
 * The position is the walked one, not the fresh head's: the surface still
 * reaches as far as it did, and walking it again would spend four reads
 * arriving back where the reader already was.
 */
export function rejoined(
  fresh: ListPage,
  held: ListPage,
  items: ReadonlyMap<ItemId, Item>,
): ListPage {
  const edge = fresh.ids.at(-1);
  const far = edge === undefined ? undefined : items.get(edge);

  const tail =
    far === undefined
      ? []
      : held.ids.filter((id) => {
          if (fresh.ids.includes(id)) return false;
          const item = items.get(id);
          return (
            item !== undefined && behind(fresh.order, rank(item), rank(far))
          );
        });

  // Exhausted, the fresh read saw the whole surface and there is no tail to be
  // right about.
  if (fresh.exhausted || tail.length === 0) return fresh;

  return {
    ...fresh,
    ids: [...fresh.ids, ...tail],
    exhausted: held.exhausted,
    ...(held.after === undefined ? {} : { after: held.after }),
  };
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

  return leaving({ ...state, items }, id);
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

/** Distinct, in the order the records were made. */
function applied(
  held: readonly string[],
  arriving: readonly RoutingRecord[],
): string[] {
  const merged = [...held];
  for (const record of arriving) {
    const template = record.applied?.template;
    if (template !== undefined && !merged.includes(template)) {
      merged.push(template);
    }
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
    templates: applied([], records),
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
 * copy rather than read back: a record that answered pending and landed later
 * still reads as pending until the item is read again.
 */
export function processed(
  state: ClientState,
  id: ItemId,
  record: RoutingRecord,
): ClientState {
  const held = state.items.get(id)?.routing;

  return leaving(
    {
      ...state,
      items: withRouting(state, id, {
        records: (held?.records ?? 0) + 1,
        pending: (held?.pending ?? 0) + (record.state === "pending" ? 1 : 0),
        to: targets(held?.to ?? [], [wentTo(record)]),
        templates: applied(held?.templates ?? [], [record]),
      }),
    },
    id,
    "queue",
  );
}

/**
 * The kinds that say an item is processed, which is the whole of what takes a
 * row off the queue.
 */
const PROCESSING: ReadonlySet<string> = new Set([
  "template-fired",
  "routed",
  "archived",
  "revised",
  "purged",
]);

/** A tag's agent is never notemap, which tags nothing. */
function tagAgent(by: Agent): Tag["by"] | undefined {
  return by.kind === "notemap" ? undefined : by;
}

/** Whether this client has a tag or an untag of this item and tag still to send. */
function reclassifying(state: ClientState, id: string, tag: string): boolean {
  return state.outbox.some(
    ({ operation }) =>
      (operation.kind === "tag" || operation.kind === "untag") &&
      operation.item === id &&
      operation.tag === tag,
  );
}

/**
 * A tag an action added or took off, applied to the copy held of its item.
 * Not where this client has its own change to the same tag still unsent: the
 * copy already says what the person did last, and an older action would undo it.
 */
function reclassifiedBy(state: ClientState, action: Action): ClientState {
  const id = action.subject;
  const tag = action.detail["tag"];
  const item = id === undefined ? undefined : state.items.get(id);
  if (item === undefined || typeof tag !== "string") return state;
  if (reclassifying(state, item.id, tag)) return state;

  const held = item.tags ?? [];
  const has = held.some((each) => each.name === tag);

  let tags: readonly Tag[] | undefined;
  if (action.kind === "untagged" && has) {
    tags = held.filter((each) => each.name !== tag);
  } else if (action.kind === "tagged" && !has) {
    const by = tagAgent(action.by);
    if (by !== undefined)
      tags = [...held, { name: tag, by, addedAt: action.at }];
  }
  if (tags === undefined) return state;

  return reconciled(
    { ...state, items: cached(state, [{ ...item, tags: [...tags] }]) },
    item.id,
  );
}

/**
 * What the pool did while nobody was asking it, applied to the surfaces. The
 * queue can be wrong about what is processed — an item processed elsewhere
 * leaves it with nothing here to notice, until a read says so — and a filtered
 * page about what carries its tags, which is why a tag added or taken off is
 * applied to the copy held as well.
 *
 * What arrived or returned is not placed here: an action carries no item to
 * place, so `heard` names what to read and the read places it.
 */
export function caughtUp(
  state: ClientState,
  actions: readonly Action[],
): ClientState {
  let current = state;
  for (const action of actions) {
    if (action.kind === "tagged" || action.kind === "untagged") {
      current = reclassifiedBy(current, action);
    } else if (PROCESSING.has(action.kind) && action.subject !== undefined) {
      current = leaving(current, action.subject, "queue");
    }
  }
  return current;
}

/**
 * The kinds that change what a held item's routing summary says. An action
 * names no summary, and folding counts from one would count a record twice
 * where the answer that made it was folded already, so the item is read again
 * instead.
 */
const REROUTING: ReadonlySet<string> = new Set(["template-fired", "routed"]);

/**
 * The kinds that may make an item work again, held or not, and change a held
 * one's routing as well. Whether it is work again is the read's to say: a
 * cancelled record may leave others standing.
 */
const RETURNING: ReadonlySet<string> = new Set([
  "unarchived",
  "delivery-cancelled",
  "work-abandoned",
]);

export type Heard = {
  /** Every item to read, each once, which the reads place where they belong. */
  readonly read: readonly ItemId[];
  /** Of those, the captures and revisions this client neither holds nor is making. */
  readonly arrived: readonly ItemId[];
};

/** The item a revision made, which the action names in its detail. */
function revisionIn(action: Action): ItemId | undefined {
  const revision = action.detail["revision"];
  return typeof revision === "string" ? (revision as ItemId) : undefined;
}

/**
 * What these actions leave to read. A capture or a revision the client holds
 * is not news, being its own or one a read already drew; nor is a revision of
 * an item it has an edit of still to send, which is that edit landing. An item
 * that returned is read held or not, since it may belong inside a window that
 * never had it. An item with an operation still to send is left to that
 * operation's answer.
 */
export function heard(
  state: ClientState,
  actions: readonly Action[],
  unsent: ReadonlySet<ItemId>,
  editing: ReadonlySet<ItemId>,
): Heard {
  const read = new Set<ItemId>();
  const arrived = new Set<ItemId>();

  for (const action of actions) {
    const subject = action.subject;
    if (subject === undefined) continue;

    if (action.kind === "captured" || action.kind === "revised") {
      if (action.kind === "revised" && editing.has(subject)) continue;
      const id = action.kind === "revised" ? revisionIn(action) : subject;
      if (id === undefined || state.items.has(id) || unsent.has(id)) continue;
      read.add(id);
      arrived.add(id);
      continue;
    }

    if (unsent.has(subject)) continue;
    // Abandoned enrichment names the item too, and leaves its routing alone.
    if (action.kind === "work-abandoned" && !("record" in action.detail))
      continue;

    if (
      RETURNING.has(action.kind) ||
      (REROUTING.has(action.kind) && state.items.has(subject))
    ) {
      read.add(subject);
    }
  }

  return { read: [...read], arrived: [...arrived] };
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

  return reconciled(held, id);
}

/**
 * An item that has just been captured, placed on both surfaces by its rank and
 * only where the page reaches: they read the same key in either direction, so
 * the newest arrival is at the head of one and past the end of the other.
 */
export function arrived(state: ClientState, item: Item): ClientState {
  return reconciled({ ...state, items: cached(state, [item]) }, item.id);
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
      : leaving(
          {
            ...state,
            items: cached(state, [
              { ...from, revisedInto: [...from.revisedInto, revision.id] },
            ]),
          },
          revisionOf,
          "queue",
        );

  return arrived(held, revision);
}

/**
 * Replaces the optimistic copy with what the pool recorded, and puts the item
 * on the right side of every page: the pool decides whether it is still work,
 * and which tags it carries. Nothing re-ranks it — the key is capture time,
 * which no mutation moves — so an item a page still holds keeps the place it
 * was drawn in.
 */
export function settle(state: ClientState, item: Item): ClientState {
  return reconciled({ ...state, items: cached(state, [item]) }, item.id);
}
