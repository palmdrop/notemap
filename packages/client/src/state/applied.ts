import type { ClientState } from "./state";

export type Undo = (state: ClientState) => ClientState;

/**
 * A cache change and the reversal for a refusal to run. The reversal takes the
 * state as it is by then, not as it was, because other operations may have
 * settled in between.
 */
export type Applied = {
  readonly state: ClientState;
  readonly undo: Undo;
};

export function unchanged(state: ClientState): Applied {
  return { state, undo: (current) => current };
}
