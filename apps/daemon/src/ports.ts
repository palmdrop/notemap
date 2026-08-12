import { v7 as uuidv7 } from "uuid";

import { createFilesystemBlobStore } from "@notemap/blob-fs";
import { createFilesystemMirrorWriter } from "@notemap/mirror-fs";
import { createAjvSchemaValidator } from "@notemap/schema-ajv";
import { createSqlitePoolStore } from "@notemap/store-sqlite";
import {
  createPool,
  type BlobStore,
  type Clock,
  type IdGenerator,
  type MintableId,
  type MirrorWriter,
  type Pool,
  type PoolConfig,
  type PoolPorts,
  type Timestamp,
} from "@notemap/core";

import { RENDERERS } from "./mirror/renderers";

export const systemClock: Clock = {
  now: () => new Date().toISOString() as Timestamp,
};

export const uuidV7Ids: IdGenerator = {
  next: <T extends MintableId>() => uuidv7() as T,
};

export type OpenPoolConfig = {
  /** The SQLite file. */
  readonly file: string;
  readonly config: PoolConfig;
  /** Where blobs go. Not optional: a pool that cannot store bytes cannot capture an image. */
  readonly assetRoot: string;
  /** Absent disables the mirror, and then capture enqueues nothing. */
  readonly mirrorRoot?: string;
};

/**
 * The pool, and the two drivers the host keeps a handle on. The mirror writer,
 * because the host is what drives it: core records that a write is owed and
 * never performs one. The blob store, because its layout is its own and a
 * rendering that points at a blob has to ask it where one is.
 */
export type OpenPool = {
  readonly pool: Pool;
  readonly blobs: BlobStore;
  readonly mirrorWriter?: MirrorWriter;
};

export function openPool(options: OpenPoolConfig): OpenPool {
  const blobs = createFilesystemBlobStore({ root: options.assetRoot });

  const mirrorWriter =
    options.mirrorRoot === undefined
      ? undefined
      : createFilesystemMirrorWriter({
          root: options.mirrorRoot,
          renderers: RENDERERS,
        });

  const store = createSqlitePoolStore({
    file: options.file,
    clock: systemClock,
  });

  const ports: PoolPorts = {
    store,
    work: store,
    clock: systemClock,
    ids: uuidV7Ids,
    schemas: createAjvSchemaValidator(),
    blobs,
    ...(mirrorWriter === undefined ? {} : { mirrorWriter }),
    destinations: [],
  };

  return {
    pool: createPool(options.config, ports),
    blobs,
    ...(mirrorWriter === undefined ? {} : { mirrorWriter }),
  };
}
