import type { Handler } from "../handler";
import type { Operation } from "../operations";

/**
 * The vocabulary `client.md` names that core answers `notImplemented` to. They
 * carry no encoder and no optimistic apply, so the outbox refuses them rather
 * than guessing a wire, and giving one a route later is a handler rather than a
 * reshape of the engine.
 */
const onItem = { target: (operation: { item: string }) => operation.item };

function sameTag(one: { tag: string }, other: Operation): boolean {
  return "tag" in other && one.tag === other.tag;
}

export const edit: Handler<"edit"> = onItem;

export const tag: Handler<"tag"> = {
  ...onItem,
  opposedBy: "untag",
  conflicts: sameTag,
};

export const untag: Handler<"untag"> = {
  ...onItem,
  opposedBy: "tag",
  conflicts: sameTag,
};

export const acceptSuggestion: Handler<"accept-suggestion"> = onItem;
export const rejectSuggestion: Handler<"reject-suggestion"> = onItem;
