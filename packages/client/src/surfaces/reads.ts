import { answered, type Api } from "../api/http";
import type { ItemSlice } from "../api/types";
import { saidBy } from "../errors";
import type { Writable } from "../observable/observable";
import { cached, type ClientState, type ListPage } from "../state/state";

const PAGE = 25;

export type Surface = "feed" | "queue";

/** The slice hands back a ready-made URL; the typed client takes parameters. */
function positionIn(next: string): string | undefined {
  return new URL(next, "http://pool").searchParams.get("after") ?? undefined;
}

function read(
  api: Api,
  surface: Surface,
  after: string | undefined,
): Promise<ItemSlice> {
  const query = {
    order: surface === "feed" ? "newest-first" : "oldest-first",
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
): Promise<void> {
  const page = state.get()[surface];
  if (page.loading || page.exhausted) return;

  state.update((current) => ({
    ...current,
    [surface]: loading(current[surface]),
  }));

  try {
    const slice = await read(api, surface, page.after);
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
