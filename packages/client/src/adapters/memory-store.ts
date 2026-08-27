import type {
  AssetId,
  Destination,
  Item,
  ItemId,
  PoolIdentity,
  TagUse,
} from "#api/types";
import type { OperationId, PendingOperation } from "#outbox/operations";
import type { ClientStore } from "#ports/store";
import { localUrls } from "./local-urls";

export function createMemoryStore(): ClientStore {
  const operations = new Map<OperationId, PendingOperation>();
  const items = new Map<ItemId, Item>();
  const blobs = new Map<AssetId, File>();
  const urls = localUrls();

  let tags: readonly TagUse[] = [];
  let destinations: readonly Destination[] = [];
  let pool: PoolIdentity | undefined;

  return {
    readOutbox: async () => [...operations.values()],

    async writeOperation(operation) {
      operations.set(operation.id, operation);
    },

    async removeOperation(id) {
      operations.delete(id);
    },

    readItems: async () => [...items.values()],

    async writeItems(written) {
      for (const item of written) items.set(item.id, item);
    },

    async removeItems(ids) {
      for (const id of ids) items.delete(id);
    },

    readTags: async () => tags,

    async writeTags(written) {
      tags = written;
    },

    readDestinations: async () => destinations,

    async writeDestinations(written) {
      destinations = written;
    },

    readPoolIdentity: async () => pool,

    async writePoolIdentity(identity) {
      pool = identity;
    },

    readBlob: async (asset) => blobs.get(asset),

    async writeBlob(asset, blob) {
      urls.release(asset);
      blobs.set(asset, blob);
    },

    async removeBlob(asset) {
      urls.release(asset);
      blobs.delete(asset);
    },

    blobUrl: async (asset) => urls.of(asset, blobs.get(asset)),
  };
}
