import type { Handler } from "../handler";

/**
 * The vocabulary `client.md` names that core answers `notImplemented` to. They
 * carry no encoder and no optimistic apply, so the outbox refuses them rather
 * than guessing a wire, and giving one a route later is a handler rather than a
 * reshape of the engine.
 */
const onItem = { target: (operation: { item: string }) => operation.item };

export const acceptSuggestion: Handler<"accept-suggestion"> = onItem;
export const rejectSuggestion: Handler<"reject-suggestion"> = onItem;
