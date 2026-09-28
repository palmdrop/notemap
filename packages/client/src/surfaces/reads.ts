import { answered, type Api } from "#api/http";
import type { ItemSlice } from "#api/types";
import { saidBy, Unreachable } from "../errors";
import type { Writable } from "../observable/observable";
import {
  cached,
  emptyPage,
  filterOf,
  fromCache,
  reading,
  rejoined,
  sameFilter,
  unfiltered,
  unpositioned,
  withReading,
  type ClientState,
  type ListPage,
  type Surface,
} from "#state/state";
import type { Order } from "../types";

const SURFACES: readonly Surface[] = ["feed", "queue"];

const PAGE = 25;

/** The slice hands back a ready-made URL; the typed client takes parameters. */
function positionIn(next: string): string | undefined {
  return new URL(next, "http://pool").searchParams.get("after") ?? undefined;
}

function read(api: Api, surface: Surface, page: ListPage): Promise<ItemSlice> {
  const after = page.after;
  const tag = page.filter ?? [];
  const query = {
    order: page.order,
    limit: String(PAGE),
    ...(after === undefined ? {} : { after }),
    ...(tag.length === 0 ? {} : { tag: [...tag] }),
  };

  return answered(
    surface === "feed"
      ? api.GET("/v1/feed", { params: { query } })
      : api.GET("/v1/queue", { params: { query } }),
  );
}

function loading(page: ListPage): ListPage {
  const { failure: _failure, ...rest } = page;
  return { ...rest, loading: true };
}

function extended(page: ListPage, slice: ItemSlice): ListPage {
  const arriving = slice.values
    .map((item) => item.id)
    .filter((id) => !page.ids.includes(id));

  const next = slice.next === undefined ? undefined : positionIn(slice.next);

  return {
    order: page.order,
    ...(page.filter === undefined ? {} : { filter: page.filter }),
    ids: [...page.ids, ...arriving],
    exhausted: slice.next === undefined,
    loading: false,
    answered: true,
    ...(next === undefined ? {} : { after: next }),
  };
}

/**
 * What the surface holds while a read is in flight. A read that starts again
 * from nothing goes on drawing what was already there, so one that fails leaves
 * the reader no worse off than before it was made.
 *
 * A turn is the exception, and the only one: the rows drawn and the position
 * they were read at are the other order's, and keeping them would leave a
 * surface that failed to turn claiming an order its cursor is not in.
 */
function whileReading(page: ListPage, held: ListPage): ListPage {
  return loading(page.order === held.order ? held : page);
}

/**
 * The page a read answered for, less whatever left the surface while it was in
 * flight — a decision the person made, or an action the watcher applied. Those
 * stay gone: a read that started before they left does not carry them back.
 */
function stillHeld(page: ListPage, held: ListPage): ListPage {
  const kept = page.ids.filter((id) => held.ids.includes(id));
  return kept.length === page.ids.length ? page : { ...page, ids: kept };
}

/**
 * The page a read answers for: the whole one for a read through no filter,
 * whether or not a filter is on the surface now, or the filtered one while it
 * is still read through the filter the read was asked with. One asked through a
 * filter since lifted or changed lands nowhere: its rows are cached and its
 * position belongs to nothing drawn.
 */
function answering(
  current: ClientState,
  surface: Surface,
  page: ListPage,
): ListPage | undefined {
  if (filterOf(page.filter ?? []).length === 0) return current[surface];
  const held = current.filtered[surface];
  return held !== undefined && sameFilter(held.filter, page.filter)
    ? held
    : undefined;
}

/** Reads one page into the surface, from whichever page it was told to start at. */
async function walk(
  state: Writable<ClientState>,
  api: Api,
  surface: Surface,
  page: ListPage,
  /** Whether the answer is a fresh head to join to the tail already walked. */
  rejoining = false,
): Promise<void> {
  state.update((current) =>
    withReading(
      current,
      surface,
      whileReading(page, answering(current, surface, page) ?? page),
    ),
  );

  try {
    const slice = await read(api, surface, page);
    state.update((current) => {
      const items = cached(current, slice.values);
      const held = answering(current, surface, page);
      if (held === undefined) return { ...current, items };

      const landed = extended(stillHeld(page, held), slice);

      return withReading({ ...current, items }, surface, {
        ...(rejoining ? rejoined(landed, held, items) : landed),
      });
    });
  } catch (error) {
    state.update((current) => {
      const held = answering(current, surface, page);
      if (held === undefined) return current;

      return withReading(current, surface, {
        ...held,
        loading: false,
        // No rows came from the pool, so the surface is the client's own again.
        answered: held.ids.length > 0,
        failure: {
          said: saidBy(error),
          // The same reading the probe makes: a refusal is still the pool
          // answering, and only silence is not.
          refused: !(error instanceof Unreachable),
        },
      });
    });
  }
}

/**
 * Walks one surface forward by following the position the last page handed
 * back. Both surfaces arrive already ordered, so a page only ever extends the
 * tail of the list it belongs to.
 */
export async function loadMore(
  state: Writable<ClientState>,
  api: Api,
  surface: Surface,
  order?: Order,
): Promise<void> {
  const held = reading(state.get(), surface);

  // A read in flight is answering for the page as it was; letting a second one
  // start would let the first land its rows and its position in whatever the
  // surface has become. Exhaustion is the held page's alone: turning an
  // exhausted surface around is the case that has to keep working.
  if (held.loading) return;

  // Turning the surface around invalidates the position it was walking, so the
  // page starts again rather than stitching two orders together.
  // The claim that these rows are the pool's is carried across a turn rather
  // than dropped: giving it up here is what made an ordinary reorder flash the
  // whole cache in between.
  const page =
    order === undefined || order === held.order
      ? held
      : { ...emptyPage(order, held.filter), answered: held.answered };
  if (page.exhausted) return;

  await walk(state, api, surface, page);
}

/**
 * Reads a surface from the start because somebody has just arrived at it.
 *
 * Only the queue does this. The feed accumulates and nothing ever leaves it, so
 * a fresh first page there answers a question nobody asked; the queue's
 * membership changes under the reader — a trigger tag fires, another device
 * processes something — and being right about what is left is its whole job.
 * A surface nobody has read yet is read for the first time either way.
 *
 * The walked tail is kept, not given up. Opening a capture unmounts the
 * register, so arriving is what coming back from one capture looks like, and a
 * reader four pages into a drain session may not be charged those four pages
 * for having looked at a row.
 *
 * Arriving through a filter the surface is not already read through starts a
 * filtered page afresh, the whole one kept beside it; arriving through none
 * drops the filtered page and goes back to the whole one as it stood.
 */
export async function enter(
  state: Writable<ClientState>,
  api: Api,
  surface: Surface,
  order?: Order,
  tags: readonly string[] = [],
): Promise<void> {
  const filter = filterOf(tags);
  const before = reading(state.get(), surface);
  const lifted = filter.length === 0 && (before.filter ?? []).length > 0;

  if (!sameFilter(before.filter, filter)) {
    state.update((current) =>
      filter.length === 0
        ? unfiltered(current, surface)
        : withReading(
            current,
            surface,
            emptyPage(order ?? before.order, filter),
          ),
    );
  }

  const held = reading(state.get(), surface);
  if (held.loading) return;

  // Back to the feed as it stood: arriving is not a reason to read past it.
  if (lifted && surface === "feed" && !unpositioned(held)) return;

  const wanted = order ?? held.order;
  if (surface !== "queue" || unpositioned(held))
    return loadMore(state, api, surface, order);

  await walk(state, api, surface, emptyPage(wanted, held.filter), true);
}

/** A failure the pool never made is over the moment the pool answers again. */
function settled(page: ListPage): ListPage {
  if (page.failure === undefined || page.failure.refused) return page;

  const { failure: _failure, ...rest } = page;
  return rest;
}

/**
 * Puts the surfaces back in touch with the pool after it has been out of reach.
 *
 * A surface holding nothing the pool gave it is read again from the start,
 * since there is no position to continue from and the first page replaces what
 * was drawn. One that walked real pages keeps them — throwing away a long scroll
 * to answer a reconnect costs more than it is worth — and loses only the
 * failure it was left with. A surface nobody has read stays cold: coming back
 * into reach is not a reason to read something for the first time.
 */
export async function readAfterReturn(
  state: Writable<ClientState>,
  api: Api,
): Promise<void> {
  await Promise.all(
    SURFACES.map(async (surface) => {
      const page = reading(state.get(), surface);
      if (unpositioned(page) && page.failure === undefined) return;

      if (fromCache(page))
        await walk(state, api, surface, emptyPage(page.order, page.filter));
      else
        state.update((current) => {
          const held = answering(current, surface, page);
          return held === undefined
            ? current
            : withReading(current, surface, settled(held));
        });
    }),
  );
}
