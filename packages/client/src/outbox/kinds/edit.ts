import { answered } from "#api/http";
import type { Item, ItemId, Tag } from "#api/types";
import { uploaded } from "#assets/assets";
import { unchanged, type Applied } from "#state/applied";
import { cached, reconciled, revised, type ClientState } from "#state/state";
import { replacing, type Handler, type Landed } from "../handler";
import type { Operation } from "../operations";

function tagging(item: ItemId, tags: readonly string[]): readonly Operation[] {
  return tags.map((tag) => ({ kind: "tag", item, tag }));
}

export const edit: Handler<"edit"> = {
  target: (operation) => operation.item,

  /** Drawn as an amendment; another client may have routed it since, and the
   * settlement is what reconciles that. */
  apply(state, operation, at): Applied {
    const previous = state.items.get(operation.item);
    if (previous === undefined) return unchanged(state);

    const carried = previous.tags ?? [];
    const added: readonly Tag[] = (operation.tags ?? [])
      .filter((name) => !carried.some((held) => held.name === name))
      .map((name) => ({ name, by: { kind: "person" }, addedAt: at }));

    const amended: Item = {
      ...previous,
      payload: operation.envelope.payload,
      contentUpdatedAt: at,
      ...(added.length === 0 ? {} : { tags: [...carried, ...added] }),
    };

    return {
      state: reconciled(
        { ...state, items: cached(state, [amended]) },
        operation.item,
      ),
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
          ...(added.length === 0
            ? {}
            : {
                tags: (held.tags ?? []).filter(
                  (tag) => !added.some((one) => one.name === tag.name),
                ),
              }),
        };

        return reconciled(
          { ...current, items: cached(current, [restored]) },
          operation.item,
        );
      },
    };
  },

  async send(sending, operation): Promise<Landed> {
    // A revision is an ordinary capture, so its payload may name bytes the pool
    // has never seen — an edit of a picture captured while it was out of reach.
    await uploaded(sending, operation);

    const outcome = await answered(
      sending.api.POST("/v1/items/{id}/edit", {
        params: { path: { id: operation.item } },
        body: operation.envelope,
      }),
    );
    const tags = operation.tags ?? [];

    if (outcome.kind === "amended") {
      return {
        settle: replacing(outcome.item),
        next: tagging(outcome.item.id, tags),
      };
    }

    // The guess goes back first, or the item keeps content it never carried.
    const revision = outcome.revision;
    return {
      settle: (state: ClientState, revert) =>
        revised(revert(state), operation.item, revision),
      next: tagging(revision.id, tags),
    };
  },
};
