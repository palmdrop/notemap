import { answered, type Api } from "../../api/http";
import type { Item, Tag } from "../../api/types";
import { unchanged, type Applied } from "../../state/applied";
import { cached, type ClientState } from "../../state/state";
import { replacing, type Handler, type Settlement } from "../handler";
import type { Operation } from "../operations";

function sameTag(one: { tag: string }, other: Operation): boolean {
  return "tag" in other && one.tag === other.tag;
}

/** Classification never moves an item, so neither half touches a list. */
function reclassified(
  state: ClientState,
  item: string,
  tags: (held: readonly Tag[]) => readonly Tag[],
): Applied {
  const previous = state.items.get(item);
  if (previous === undefined) return unchanged(state);

  const changed: Item = { ...previous, tags: [...tags(previous.tags ?? [])] };

  return {
    state: { ...state, items: cached(state, [changed]) },
    undo: (current) => {
      const held = current.items.get(item);
      return held === undefined
        ? current
        : {
            ...current,
            items: cached(current, [{ ...held, tags: previous.tags }]),
          };
    },
  };
}

function send(
  api: Api,
  half: "tag" | "untag",
  item: string,
  tag: string,
): Promise<Settlement> {
  return answered(
    half === "tag"
      ? api.POST("/v1/items/{id}/tag", {
          params: { path: { id: item } },
          body: { tag },
        })
      : api.POST("/v1/items/{id}/untag", {
          params: { path: { id: item } },
          body: { tag },
        }),
  ).then(replacing);
}

export const tag: Handler<"tag"> = {
  target: (operation) => operation.item,
  opposedBy: "untag",
  conflicts: sameTag,

  apply: (state, operation, at) =>
    reclassified(state, operation.item, (held) =>
      held.some((each) => each.name === operation.tag)
        ? held
        : [
            ...held,
            { name: operation.tag, by: { kind: "person" }, addedAt: at },
          ],
    ),

  send: (api, operation) => send(api, "tag", operation.item, operation.tag),
};

export const untag: Handler<"untag"> = {
  target: (operation) => operation.item,
  opposedBy: "tag",
  conflicts: sameTag,

  apply: (state, operation) =>
    reclassified(state, operation.item, (held) =>
      held.filter((each) => each.name !== operation.tag),
    ),

  send: (api, operation) => send(api, "untag", operation.item, operation.tag),
};
