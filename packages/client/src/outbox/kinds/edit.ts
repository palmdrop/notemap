import { answered } from "../../api/http";
import type { Item } from "../../api/types";
import { unchanged, type Applied } from "../../state/applied";
import { cached, revised, type ClientState } from "../../state/state";
import { replacing, type Handler, type Settlement } from "../handler";

export const edit: Handler<"edit"> = {
  target: (operation) => operation.item,

  /**
   * Drawn as an amendment, always: the client cannot know whether it still
   * holds the head, and an amendment is the shape the person just asked for.
   * The pool may answer with a revision, which the settlement reconciles.
   */
  apply(state, operation, at): Applied {
    const previous = state.items.get(operation.item);
    if (previous === undefined) return unchanged(state);

    const amended: Item = {
      ...previous,
      payload: operation.payload,
      contentUpdatedAt: at,
    };

    return {
      state: { ...state, items: cached(state, [amended]) },
      undo: (current) => ({ ...current, items: cached(current, [previous]) }),
    };
  },

  async send(api, operation): Promise<Settlement> {
    const outcome = await answered(
      api.POST("/v1/items/{id}/edit", {
        params: { path: { id: operation.item } },
        body: operation.payload,
      }),
    );

    if (outcome.kind === "amended") return replacing(outcome.item);

    // The pool revised where the client drew an amendment. The guess goes back
    // before the revision takes its place, or the original would keep content
    // it never carried.
    const revision = outcome.revision;
    return (state: ClientState, revert) =>
      revised(revert(state), operation.item, revision);
  },
};
