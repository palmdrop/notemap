import { answered } from "../../api/http";
import { unchanged, type Applied } from "../../state/applied";
import { cached, intoPage, withIds, without } from "../../state/state";
import { replacing, type Handler } from "../handler";

export const unarchive: Handler<"unarchive"> = {
  target: (operation) => operation.item,
  opposedBy: "archive",

  apply(state, operation): Applied {
    const previous = state.items.get(operation.item);
    if (previous === undefined) return unchanged(state);

    const { archived: _archived, ...alive } = previous;
    const items = cached(state, [alive]);

    return {
      state: {
        ...state,
        items,
        queue: withIds(
          state.queue,
          intoPage(state.queue, operation.item, items),
        ),
      },
      undo: (current) => ({
        ...current,
        items: cached(current, [previous]),
        queue: withIds(
          current.queue,
          without(current.queue.ids, operation.item),
        ),
      }),
    };
  },

  async send({ api }, operation) {
    return replacing(
      await answered(
        api.POST("/v1/items/{id}/unarchive", {
          params: { path: { id: operation.item } },
          body: {},
        }),
      ),
    );
  },
};
