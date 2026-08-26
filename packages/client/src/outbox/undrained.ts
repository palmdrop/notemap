import type { ItemId } from "../api/types";
import type { PendingOperation } from "./operations";
import { targetOf } from "./registry";

/**
 * The items the outbox is still holding work for. A refusal is not one: it will
 * never drain, and the shell says so in its own shape rather than as waiting.
 */
export function undrained(
  outbox: readonly PendingOperation[],
): ReadonlySet<ItemId> {
  return new Set(
    outbox
      .filter((held) => held.state !== "refused")
      .map((held) => targetOf(held.operation)),
  );
}
