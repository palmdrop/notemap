import type { BatchAction, BatchOutcome, ItemId } from "#api/types";
import type { ClientState } from "./state";

/**
 * A batch this client made, from when it was made until the client closes,
 * or until enough answered batches came after it. A batch is a gesture, and
 * what each item came to is the item's and the log's to say after that.
 */
export type Batch = {
  readonly id: string;
  readonly action: BatchAction;
  readonly items: readonly ItemId[];
  /** Absent until the pool answers. */
  readonly outcomes?: readonly BatchOutcome[];
};

/** The most items one batch may name: what the pool takes in one request. */
export const MAX_BATCH = 500;

/** How many answered batches are held. One the pool has not answered yet is always held. */
export const ANSWERED_KEPT = 50;

export function withBatch(state: ClientState, batch: Batch): ClientState {
  const batches = new Map(state.batches).set(batch.id, batch);
  const answered = [...batches.values()].filter(
    (each) => each.outcomes !== undefined,
  );
  for (const old of answered.slice(0, -ANSWERED_KEPT)) batches.delete(old.id);
  return { ...state, batches };
}

export function withoutBatch(state: ClientState, id: string): ClientState {
  if (!state.batches.has(id)) return state;
  const batches = new Map(state.batches);
  batches.delete(id);
  return { ...state, batches };
}
