import { openDB, type DBSchema, type IDBPDatabase, type StoreNames } from "idb";

import type {
  AssetId,
  Destination,
  Item,
  ItemId,
  PoolIdentity,
  RoutingTemplate,
  TagUse,
} from "#api/types";
import type { OperationId, PendingOperation } from "#outbox/operations";
import type { ClientStore } from "#ports/store";
import { localUrls } from "./local-urls";

const DATABASE = "notemap";
/**
 * Bumped when a store is added. The upgrade makes only what is missing, so a
 * browser holding version 1 gains `templates` and keeps everything it had.
 */
const VERSION = 2;

/** The one key of every store holding a single whole value rather than rows. */
const HELD = "held";

interface Notemap extends DBSchema {
  outbox: { key: OperationId; value: PendingOperation };
  items: { key: ItemId; value: Item };
  blobs: { key: AssetId; value: File };
  tags: { key: typeof HELD; value: readonly TagUse[] };
  destinations: { key: typeof HELD; value: readonly Destination[] };
  templates: { key: typeof HELD; value: readonly RoutingTemplate[] };
  pool: { key: typeof HELD; value: PoolIdentity };
}

export type IndexedDbStoreOptions = {
  readonly database?: string;
};

/** The browser's own storage behind `ClientStore`. */
export function createIndexedDbStore(
  options: IndexedDbStoreOptions = {},
): ClientStore {
  const name = options.database ?? DATABASE;
  const urls = localUrls();

  // Opened on the first call rather than at import, so a shell can build the
  // store before it knows whether this platform has a database to give it.
  let opening: Promise<IDBPDatabase<Notemap>> | undefined;

  function open(): Promise<IDBPDatabase<Notemap>> {
    opening ??= openDB<Notemap>(name, VERSION, {
      upgrade(database) {
        const make = (
          store: StoreNames<Notemap>,
          options?: IDBObjectStoreParameters,
        ): void => {
          if (!database.objectStoreNames.contains(store)) {
            database.createObjectStore(store, options);
          }
        };

        make("outbox", { keyPath: "id" });
        make("items", { keyPath: "id" });
        make("blobs");
        make("tags");
        make("destinations");
        make("templates");
        make("pool");
      },

      // A tab left open on the old version blocks the next one's upgrade until
      // it lets go, and nothing would say why. The next call opens again.
      blocking() {
        const held = opening;
        opening = undefined;
        void held?.then((database) => {
          database.close();
        });
      },
    });

    return opening;
  }

  async function held<S extends "tags" | "destinations" | "templates" | "pool">(
    store: S,
  ): Promise<Notemap[S]["value"] | undefined> {
    return (await open()).get(store, HELD);
  }

  return {
    async readOutbox() {
      return (await open()).getAll("outbox");
    },

    async writeOperation(operation) {
      await (await open()).put("outbox", operation);
    },

    async removeOperation(id) {
      await (await open()).delete("outbox", id);
    },

    async readItems() {
      return (await open()).getAll("items");
    },

    async writeItems(written) {
      // One transaction, so a reload never finds half a page of a surface.
      const transaction = (await open()).transaction("items", "readwrite");
      await Promise.all([
        ...written.map((item) => transaction.store.put(item)),
        transaction.done,
      ]);
    },

    async removeItems(ids) {
      const transaction = (await open()).transaction("items", "readwrite");
      await Promise.all([
        ...ids.map((id) => transaction.store.delete(id)),
        transaction.done,
      ]);
    },

    async readTags() {
      return (await held("tags")) ?? [];
    },

    async writeTags(tags) {
      await (await open()).put("tags", tags, HELD);
    },

    async readDestinations() {
      return (await held("destinations")) ?? [];
    },

    async writeDestinations(destinations) {
      await (await open()).put("destinations", destinations, HELD);
    },

    async readTemplates() {
      return (await held("templates")) ?? [];
    },

    async writeTemplates(templates) {
      await (await open()).put("templates", templates, HELD);
    },

    readPoolIdentity: () => held("pool"),

    async writePoolIdentity(identity) {
      await (await open()).put("pool", identity, HELD);
    },

    async readBlob(asset) {
      return (await open()).get("blobs", asset);
    },

    async writeBlob(asset, blob) {
      urls.release(asset);
      await (await open()).put("blobs", blob, asset);
    },

    async removeBlob(asset) {
      urls.release(asset);
      await (await open()).delete("blobs", asset);
    },

    async blobUrl(asset) {
      return urls.of(asset, await (await open()).get("blobs", asset));
    },
  };
}
