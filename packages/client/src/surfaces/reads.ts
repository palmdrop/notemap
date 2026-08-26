import { answered, type Api } from "../api/http";
import type { ItemSlice } from "../api/types";
import { saidBy, Unreachable } from "../errors";
import type { Writable } from "../observable/observable";
import {
  cached,
  emptyPage,
  fromCache,
  unpositioned,
  type ClientState,
  type ListPage,
  type Surface,
} from "../state/state";
import type { Order } from "../types";

const SURFACES: readonly Surface[] = ["feed", "queue"];

const PAGE = 25;

/** The slice hands back a ready-made URL; the typed client takes parameters. */
function positionIn(next: string): string | undefined {
  return new URL(next, "http://pool").searchParams.get("after") ?? undefined;
}

function read(api: Api, surface: Surface, page: ListPage): Promise<ItemSlice> {
  const after = page.after;
  const query = {
    order: page.order,
    limit: String(PAGE),
    ...(after === undefined ? {} : { after }),
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
    ids: [...page.ids, ...arriving],
    exhausted: slice.next === undefined,
    loading: false,
    answered: true,
    ...(next === undefined ? {} : { after: next }),
  };
}

/** Reads one page into the surface, from whichever page it was told to start at. */
async function walk(
  state: Writable<ClientState>,
  api: Api,
  surface: Surface,
  page: ListPage,
): Promise<void> {
  state.update((current) => ({ ...current, [surface]: loading(page) }));

  try {
    const slice = await read(api, surface, page);
    state.update((current) => ({
      ...current,
      items: cached(current, slice.values),
      [surface]: extended(current[surface], slice),
    }));
  } catch (error) {
    state.update((current) => ({
      ...current,
      [surface]: {
        ...current[surface],
        loading: false,
        // No rows came from the pool, so the surface is the client's own again.
        answered: current[surface].ids.length > 0,
        failure: {
          said: saidBy(error),
          // The same reading the probe makes: a refusal is still the pool
          // answering, and only silence is not.
          refused: !(error instanceof Unreachable),
        },
      },
    }));
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
  const held = state.get()[surface];

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
      : { ...emptyPage(order), answered: held.answered };
  if (page.exhausted) return;

  await walk(state, api, surface, page);
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
      const page = state.get()[surface];
      if (unpositioned(page) && page.failure === undefined) return;

      if (fromCache(page)) await walk(state, api, surface, emptyPage(page.order));
      else state.update((current) => ({ ...current, [surface]: settled(current[surface]) }));
    }),
  );
}
