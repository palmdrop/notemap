import type { PoolPorts, PoolTx } from "../types/api/ports";
import type { Action } from "../types/domain/action-log";
import type { ActionId } from "../types/domain/ids";

/** An entry with everything but its identity, which is core's to mint. */
export type ActionDraft = Omit<Action, "id">;

/**
 * The one place a mutation appends to the log. `at` is the caller's, because it
 * is the instant the change was applied at rather than the instant the entry
 * was written — and in a transaction that also enqueues work, the two must be
 * the same instant.
 */
export function recordAction(
  ports: PoolPorts,
  tx: PoolTx,
  draft: ActionDraft,
): Promise<void> {
  return tx.appendAction({ ...draft, id: ports.ids.next<ActionId>() });
}
