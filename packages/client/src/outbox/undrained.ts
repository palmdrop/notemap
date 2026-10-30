import type { ItemId } from "#api/types";
import type { PendingOperation } from "./operations";
import { targetsOf } from "./registry";

export function waiting(
  outbox: readonly PendingOperation[],
): readonly PendingOperation[] {
  return outbox.filter((held) => held.state !== "refused");
}

export function undrained(
  outbox: readonly PendingOperation[],
): ReadonlySet<ItemId> {
  return new Set(waiting(outbox).flatMap((held) => targetsOf(held.operation)));
}

/** The items an edit is still to be sent for, whose revision is that edit landing. */
export function editing(
  outbox: readonly PendingOperation[],
): ReadonlySet<ItemId> {
  return new Set(
    waiting(outbox).flatMap(({ operation }) =>
      operation.kind === "edit" ? [operation.item] : [],
    ),
  );
}
