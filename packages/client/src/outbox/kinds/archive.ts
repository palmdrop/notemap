import { answered } from "../../api/http";
import type { Item, ItemId } from "../../api/types";
import { unchanged, type Applied } from "../../state/applied";
import { cached, withIds, without } from "../../state/state";
import type { Handler } from "../handler";

function replaced(
  ids: readonly ItemId[],
  id: ItemId,
  at: number,
): readonly ItemId[] {
  if (at < 0 || ids.includes(id)) return ids;

  const where = Math.min(at, ids.length);
  return [...ids.slice(0, where), id, ...ids.slice(where)];
}

export const archive: Handler<"archive"> = {
  target: (operation) => operation.item,
  opposedBy: "unarchive",

  apply(state, operation, at): Applied {
    const previous = state.items.get(operation.item);
    if (previous === undefined) return unchanged(state);

    const { reason } = operation;
    const archived: Item = {
      ...previous,
      archived: { archivedAt: at, ...(reason === undefined ? {} : { reason }) },
    };

    // The index, not the rank: the pool breaks ties on a key of its own, so
    // re-ranking a rolled-back item would shuffle it past its neighbours.
    const was = state.queue.ids.indexOf(operation.item);

    return {
      state: {
        ...state,
        items: cached(state, [archived]),
        queue: withIds(state.queue, without(state.queue.ids, operation.item)),
      },
      undo: (current) => ({
        ...current,
        items: cached(current, [previous]),
        queue: withIds(
          current.queue,
          replaced(current.queue.ids, operation.item, was),
        ),
      }),
    };
  },

  send: (api, operation) =>
    answered(
      api.POST("/v1/items/{id}/archive", {
        params: { path: { id: operation.item } },
        body:
          operation.reason === undefined ? {} : { reason: operation.reason },
      }),
    ),
};
