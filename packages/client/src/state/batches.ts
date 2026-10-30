import type { BatchAction, BatchOutcome, ItemId } from "#api/types";
import type { ClientState } from "./state";

/**
 * A batch this client made, from when it was made until the client closes.
 * Kept for no longer: a batch is a gesture, and what each item came to is the
 * item's and the log's to say after that.
 */
export type Batch = {
  readonly id: string;
  readonly action: BatchAction;
  readonly items: readonly ItemId[];
  /** Absent until the pool answers. */
  readonly outcomes?: readonly BatchOutcome[];
};

export function withBatch(state: ClientState, batch: Batch): ClientState {
  return { ...state, batches: new Map(state.batches).set(batch.id, batch) };
}

export function withoutBatch(state: ClientState, id: string): ClientState {
  if (!state.batches.has(id)) return state;
  const batches = new Map(state.batches);
  batches.delete(id);
  return { ...state, batches };
}
