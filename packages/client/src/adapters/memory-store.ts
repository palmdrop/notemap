import type {
  AssetId,
  Destination,
  Item,
  ItemId,
  PoolIdentity,
  TagUse,
} from "../api/types";
import type { OperationId, PendingOperation } from "../outbox/operations";
import type { ClientStore } from "../ports/store";
import { localUrls } from "./local-urls";

export function createMemoryStore(): ClientStore {
  const operations = new Map<OperationId, PendingOperation>();
  const items = new Map<ItemId, Item>();
  const blobs = new Map<AssetId, Blob>();
  const urls = localUrls();

  let tags: readonly TagUse[] = [];
  let destinations: readonly Destination[] = [];
  let pool: PoolIdentity | undefined;

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

    readTags: () => Promise.resolve(tags),

    writeTags(written) {
      tags = written;
      return Promise.resolve();
    },

    readDestinations: () => Promise.resolve(destinations),

    writeDestinations(written) {
      destinations = written;
      return Promise.resolve();
    },

    readPoolIdentity: () => Promise.resolve(pool),

    writePoolIdentity(identity) {
      pool = identity;
      return Promise.resolve();
    },

    readBlob: (asset) => Promise.resolve(blobs.get(asset)),

    writeBlob(asset, blob) {
      blobs.set(asset, blob);
      return Promise.resolve();
    },

    removeBlob(asset) {
      urls.release(asset);
      blobs.delete(asset);
      return Promise.resolve();
    },

    blobUrl: (asset) => Promise.resolve(urls.of(asset, blobs.get(asset))),
  };
}
