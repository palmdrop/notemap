import type { Item, ItemId } from "../api/types";
import type { OperationId, PendingOperation } from "../outbox/operations";
import type { ClientStore } from "../ports/store";

/** The online pair's half: nothing survives a reload, and nothing is meant to. */
export function createMemoryStore(): ClientStore {
  const operations = new Map<OperationId, PendingOperation>();
  const items = new Map<ItemId, Item>();

  return {
    readOutbox: () => Promise.resolve([...operations.values()]),

    writeOperation(operation) {
      operations.set(operation.id, operation);
      return Promise.resolve();
    },

    removeOperation(id) {
      operations.delete(id);
      return Promise.resolve();
    },

    readItems: () => Promise.resolve([...items.values()]),

    writeItems(written) {
      for (const item of written) items.set(item.id, item);
      return Promise.resolve();
    },

    removeItems(ids) {
      for (const id of ids) items.delete(id);
      return Promise.resolve();
    },
  };
}
