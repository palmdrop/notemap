import { answered } from "#api/http";
import { unchanged, type Applied } from "#state/applied";
import type { ItemId } from "#api/types";
import { cached, reconciled, type ClientState } from "#state/state";
import { replacing, type Handler } from "../handler";

export function unarchiving(
  state: ClientState,
  operation: { readonly item: ItemId },
): Applied {
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
}

export const unarchive: Handler<"unarchive"> = {
  targets: (operation) => [operation.item],
  opposedBy: "archive",

  apply: unarchiving,

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
