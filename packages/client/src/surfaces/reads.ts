import { answered, type Api } from "../api/http";
import type { ItemSlice } from "../api/types";
import { saidBy } from "../errors";
import type { Writable } from "../observable/observable";
import {
  cached,
  emptyPage,
  type ClientState,
  type ListPage,
  type Surface,
} from "../state/state";
import type { Order } from "../types";

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
    ...(next === undefined ? {} : { after: next }),
  };
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
  const page =
    order === undefined || order === held.order ? held : emptyPage(order);
  if (page.exhausted) return;

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
        failure: saidBy(error),
      },
    }));
  }
}
