import type { ItemId } from "#api/types";
import type { PendingOperation } from "./operations";
import { targetOf } from "./registry";

export function waiting(
  outbox: readonly PendingOperation[],
): readonly PendingOperation[] {
  return outbox.filter((held) => held.state !== "refused");
}

export function undrained(
  outbox: readonly PendingOperation[],
): ReadonlySet<ItemId> {
  return new Set(waiting(outbox).map((held) => targetOf(held.operation)));
}
