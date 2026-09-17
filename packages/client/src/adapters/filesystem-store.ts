import { randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  AssetId,
  Destination,
  Item,
  ItemId,
  PoolIdentity,
  RoutingTemplate,
  TagUse,
} from "#api/types";
import {
  attemptable,
  type OperationId,
  type PendingOperation,
} from "#outbox/operations";
import type { ClientStore } from "#ports/store";
import { Unreadable } from "../errors";

export type FilesystemStoreOptions = {
  /** Where a file that could not be read is reported before it is set aside. */
  readonly onError?: (error: unknown) => void;
};

type Collection = "items" | "tags" | "destinations" | "templates" | "pool";

type BlobRecord = { readonly name: string; readonly type: string };

const OPERATION = ".json";
/** What a malformed operation file is renamed to, so it is kept but read no more. */
const UNREADABLE = ".unreadable";
/**
 * A hard link to the operation, made while it is being sent. Making one where
 * one exists fails, which is what lets two processes ask for the same lease
 * and only one be answered.
 */
const LEASE = ".lease";

/**
 * A directory behind `ClientStore`, for a shell that is not a browser. Each
 * collection is one file, the outbox is one file per operation, and a blob is
 * its bytes beside a record of the name and media type the bytes cannot say.
 * Every write lands by rename, so a reader sees the previous file or the next.
 */
export function createFilesystemStore(
  directory: string,
  options: FilesystemStoreOptions = {},
): ClientStore {
  const report = options.onError ?? (() => undefined);
  const outboxDirectory = join(directory, "outbox");
  const blobsDirectory = join(directory, "blobs");
  const chains = new Map<string, Promise<unknown>>();

  /**
   * Writes to one file happen in the order they were asked, so a collection
   * read, changed and written back never loses a write racing it in this
   * process.
   */
  function serialised<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = chains.get(key) ?? Promise.resolve();
    const next = previous.then(work, work);
    chains.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  async function replace(path: string, contents: string | Uint8Array) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, contents);
    await rename(temporary, path);
  }

  async function parsed<T>(
    path: string,
    collection: string,
  ): Promise<T | undefined> {
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      report(new Unreadable(collection, error));
      return undefined;
    }
  }

  function collectionPath(collection: Collection): string {
    return join(directory, `${collection}.json`);
  }

  async function read<T>(collection: Collection): Promise<T | undefined> {
    return parsed<T>(collectionPath(collection), collection);
  }

  function write(collection: Collection, value: unknown): Promise<void> {
    return serialised(collection, () =>
      replace(collectionPath(collection), JSON.stringify(value)),
    );
  }

  function operationPath(id: OperationId): string {
    return join(outboxDirectory, `${id}${OPERATION}`);
  }

  function leasePath(id: OperationId): string {
    return join(outboxDirectory, `${id}${LEASE}`);
  }

  async function readOperation(
    name: string,
  ): Promise<PendingOperation | undefined> {
    const path = join(outboxDirectory, name);
    const held = await parsed<PendingOperation>(path, `outbox/${name}`);
    if (held !== undefined) return held;

    await rename(path, path.replace(/\.json$/, UNREADABLE)).catch(
      (error: unknown) => {
        if (!isMissing(error)) throw error;
      },
    );
    return undefined;
  }

  function blobDirectory(asset: AssetId): string {
    return join(blobsDirectory, asset);
  }

  function bytesPath(asset: AssetId): string {
    return join(blobDirectory(asset), "bytes");
  }

  function recordPath(asset: AssetId): string {
    return join(blobDirectory(asset), "file.json");
  }

  async function readRecord(asset: AssetId): Promise<BlobRecord | undefined> {
    return parsed<BlobRecord>(recordPath(asset), `blobs/${asset}`);
  }

  return {
    async readOutbox() {
      let names: string[];
      try {
        names = await readdir(outboxDirectory);
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }

      const held = await Promise.all(
        names.filter((name) => name.endsWith(OPERATION)).map(readOperation),
      );
      return held.filter(
        (operation): operation is PendingOperation => operation !== undefined,
      );
    },

    async writeOperation(operation) {
      await replace(operationPath(operation.id), JSON.stringify(operation));
      if (operation.state !== "sending") {
        await rm(leasePath(operation.id), { force: true });
      }
    },

    async removeOperation(id) {
      await rm(operationPath(id), { force: true });
      await rm(leasePath(id), { force: true });
    },

    async leaseOperation(id, now, until) {
      const path = operationPath(id);
      const lease = leasePath(id);
      const held = await parsed<PendingOperation>(path, `outbox/${id}`);
      if (held === undefined || !attemptable(held, now)) return undefined;

      // A lease its process never got to release. Renamed away rather than
      // unlinked, so two takers arriving together cannot both clear it and
      // both link.
      if (held.state === "sending") {
        const stale = `${lease}.${randomUUID()}.stale`;
        await rename(lease, stale).then(
          () => rm(stale, { force: true }),
          (error: unknown) => {
            if (!isMissing(error)) throw error;
          },
        );
      }

      try {
        await link(path, lease);
      } catch (error) {
        if (isMissing(error) || isExisting(error)) return undefined;
        throw error;
      }

      const leased: PendingOperation = { ...held, state: "sending", until };
      await replace(path, JSON.stringify(leased));
      return leased;
    },

    async readItems() {
      return (await read<readonly Item[]>("items")) ?? [];
    },

    writeItems(written) {
      return serialised("items", async () => {
        const held = new Map<ItemId, Item>(
          ((await read<readonly Item[]>("items")) ?? []).map((item) => [
            item.id,
            item,
          ]),
        );
        for (const item of written) held.set(item.id, item);
        await replace(
          collectionPath("items"),
          JSON.stringify([...held.values()]),
        );
      });
    },

    removeItems(ids) {
      return serialised("items", async () => {
        const gone = new Set<ItemId>(ids);
        const kept = ((await read<readonly Item[]>("items")) ?? []).filter(
          (item) => !gone.has(item.id),
        );
        await replace(collectionPath("items"), JSON.stringify(kept));
      });
    },

    async readTags() {
      return (await read<readonly TagUse[]>("tags")) ?? [];
    },

    writeTags: (tags) => write("tags", tags),

    async readDestinations() {
      return (await read<readonly Destination[]>("destinations")) ?? [];
    },

    writeDestinations: (destinations) => write("destinations", destinations),

    async readTemplates() {
      return (await read<readonly RoutingTemplate[]>("templates")) ?? [];
    },

    writeTemplates: (templates) => write("templates", templates),

    readPoolIdentity: () => read<PoolIdentity>("pool"),

    writePoolIdentity: (identity) => write("pool", identity),

    async readBlob(asset) {
      const record = await readRecord(asset);
      if (record === undefined) return undefined;

      try {
        const bytes = await readFile(bytesPath(asset));
        return new File([bytes], record.name, { type: record.type });
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
    },

    writeBlob(asset, blob) {
      return serialised(`blob/${asset}`, async () => {
        // Bytes before the record: the record is what says a blob is there.
        await replace(
          bytesPath(asset),
          new Uint8Array(await blob.arrayBuffer()),
        );
        const record: BlobRecord = { name: blob.name, type: blob.type };
        await replace(recordPath(asset), JSON.stringify(record));
      });
    },

    removeBlob(asset) {
      return serialised(`blob/${asset}`, () =>
        rm(blobDirectory(asset), { recursive: true, force: true }),
      );
    },

    async blobUrl(asset) {
      const record = await readRecord(asset);
      return record === undefined
        ? undefined
        : pathToFileURL(bytesPath(asset)).href;
    },
  };
}

function isMissing(error: unknown): boolean {
  return codeOf(error) === "ENOENT";
}

function isExisting(error: unknown): boolean {
  return codeOf(error) === "EEXIST";
}

function codeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}
