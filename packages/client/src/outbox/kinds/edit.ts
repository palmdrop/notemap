import { answered } from "#api/http";
import type { Item } from "#api/types";
import { uploaded } from "#assets/assets";
import { unchanged, type Applied } from "#state/applied";
import { cached, revised, type ClientState } from "#state/state";
import { replacing, type Handler, type Settlement } from "../handler";

export const edit: Handler<"edit"> = {
  target: (operation) => operation.item,

  /** Drawn as an amendment; another client may have routed it since, and the
   * settlement is what reconciles that. */
  apply(state, operation, at): Applied {
    const previous = state.items.get(operation.item);
    if (previous === undefined) return unchanged(state);

    const amended: Item = {
      ...previous,
      payload: operation.envelope.payload,
      contentUpdatedAt: at,
    };

    return {
      state: { ...state, items: cached(state, [amended]) },
      // Only what this wrote goes back: a settlement reverts long after the
      // apply, and a tag drawn since is not this guess's to discard.
      undo: (current) => {
        const held = current.items.get(operation.item);
        if (held === undefined) return current;

        const { contentUpdatedAt: _drawn, ...rest } = held;
        const restored: Item = {
          ...rest,
          payload: previous.payload,
          ...(previous.contentUpdatedAt === undefined
            ? {}
            : { contentUpdatedAt: previous.contentUpdatedAt }),
        };

        return { ...current, items: cached(current, [restored]) };
      },
    };
  },

  async send(sending, operation): Promise<Settlement> {
    // A revision is an ordinary capture, so its payload may name bytes the pool
    // has never seen — an edit of a picture captured while it was out of reach.
    await uploaded(sending, operation);

    const outcome = await answered(
      sending.api.POST("/v1/items/{id}/edit", {
        params: { path: { id: operation.item } },
        body: operation.envelope,
      }),
    );

    if (outcome.kind === "amended") return replacing(outcome.item);

    // The guess goes back first, or the item keeps content it never carried.
    const revision = outcome.revision;
    return (state: ClientState, revert) =>
      revised(revert(state), operation.item, revision);
  },
};
