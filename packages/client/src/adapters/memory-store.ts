import type {
  AssetId,
  Destination,
  PoolSetting,
  RoutingTemplate,
  Item,
  ItemId,
  PoolIdentity,
  TagUse,
} from "#api/types";
import {
  attemptable,
  type OperationId,
  type PendingOperation,
} from "#outbox/operations";
import type { ClientStore } from "#ports/store";
import { localUrls } from "./local-urls";

export function createMemoryStore(): ClientStore {
  const operations = new Map<OperationId, PendingOperation>();
  const items = new Map<ItemId, Item>();
  const blobs = new Map<AssetId, File>();
  const urls = localUrls();

  let tags: readonly TagUse[] = [];
  let destinations: readonly Destination[] = [];
  let templates: readonly RoutingTemplate[] = [];
  let poolSettings: readonly PoolSetting[] | undefined;
  let pool: PoolIdentity | undefined;

  return {
    readOutbox: async () => [...operations.values()],

    async writeOperation(operation) {
      operations.set(operation.id, operation);
    },

    async removeOperation(id) {
      operations.delete(id);
    },

    async leaseOperation(id, now, until) {
      const held = operations.get(id);
      if (held === undefined || !attemptable(held, now)) return undefined;

      const leased: PendingOperation = { ...held, state: "sending", until };
      operations.set(id, leased);
      return leased;
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
    readTemplates: async () => templates,
    async writeTemplates(written) {
      templates = written;
    },

    async writeDestinations(written) {
      destinations = written;
    },

    readPoolSettings: async () => poolSettings,

    async writePoolSettings(written) {
      poolSettings = written;
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
