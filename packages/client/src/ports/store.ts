import type { Item, ItemId } from "../api/types";
import type { OperationId, PendingOperation } from "../outbox/operations";

/**
 * Where the outbox and the cache live. Every method is asynchronous even though
 * the in-memory pair answers instantly, so that a durable adapter — browser
 * storage, a file, a database — is a drop-in rather than a rewrite.
 */
export interface ClientStore {
  readOutbox(): Promise<readonly PendingOperation[]>;
  writeOperation(operation: PendingOperation): Promise<void>;
  removeOperation(id: OperationId): Promise<void>;

  readItems(): Promise<readonly Item[]>;
  writeItems(items: readonly Item[]): Promise<void>;
  removeItems(ids: readonly ItemId[]): Promise<void>;
}
