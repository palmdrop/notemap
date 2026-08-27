import type { PoolPorts, PoolTx } from "#types/api/ports";
import type { Action } from "#types/domain/action-log";
import type { ActionId } from "#types/domain/ids";

export type ActionDraft = Omit<Action, "id">;

/**
 * `at` is the caller's rather than read here: the entry carries the instant the
 * change was applied at, and a second clock read in the same transaction would
 * date it a moment later.
 */
export function recordAction(
  ports: PoolPorts,
  tx: PoolTx,
  draft: ActionDraft,
): Promise<void> {
  return tx.appendAction({ ...draft, id: ports.ids.next<ActionId>() });
}
