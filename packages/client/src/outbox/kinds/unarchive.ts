import { answered } from "#api/http";
import { unchanged, type Applied } from "#state/applied";
import { cached, reconciled } from "#state/state";
import { replacing, type Handler } from "../handler";

export const unarchive: Handler<"unarchive"> = {
  target: (operation) => operation.item,
  opposedBy: "archive",

  apply(state, operation): Applied {
    const previous = state.items.get(operation.item);
    if (previous === undefined) return unchanged(state);

    const { archived: _archived, ...alive } = previous;

    return {
      state: reconciled(
        { ...state, items: cached(state, [alive]) },
        operation.item,
      ),
      undo: (current) =>
        reconciled(
          { ...current, items: cached(current, [previous]) },
          operation.item,
        ),
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
