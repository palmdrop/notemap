import type { Api } from "../api/http";
import type { Item, ItemId } from "../api/types";
import type { Applied } from "../state/applied";
import type { ClientState } from "../state/state";
import type { Operation, OperationKind } from "./operations";

type Of<K extends OperationKind> = Extract<Operation, { kind: K }>;

/**
 * Everything one operation knows about itself. `apply` and `send` are absent for
 * a kind the vocabulary names but no `/v1` route accepts yet, which is why they
 * are optional rather than throwing stubs.
 */
export type Handler<K extends OperationKind> = {
  /** Which item it is about, and therefore what it drains in order with. */
  readonly target: (operation: Of<K>) => ItemId;
  /** The kind that undoes this one, resolved last-write-wins by operation-time. */
  readonly opposedBy?: OperationKind;
  /**
   * Whether two opposing operations concern the same thing and not merely the
   * same item — two tags of one item oppose only if they name one tag.
   */
  readonly conflicts?: (one: Of<K>, other: Operation) => boolean;
  readonly apply?: (
    state: ClientState,
    operation: Of<K>,
    at: string,
  ) => Applied;
  readonly send?: (api: Api, operation: Of<K>) => Promise<Item>;
};
