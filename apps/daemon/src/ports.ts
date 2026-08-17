import { v7 as uuidv7 } from "uuid";

import { createFilesystemBlobStore } from "@notemap/blob-fs";
import { createFilesystemDestination } from "@notemap/destination-fs";
import { createFilesystemMirrorWriter } from "@notemap/mirror-fs";
import { createAjvSchemaValidator } from "@notemap/schema-ajv";
import { createSqlitePoolStore } from "@notemap/store-sqlite";
import {
  createPool,
  type BlobStore,
  type Clock,
  type DestinationAdapter,
  type IdGenerator,
  type MintableId,
  type MirrorWriter,
  type Pool,
  type PoolConfig,
  type PoolPorts,
  type Timestamp,
} from "@notemap/core";

import type { DestinationConfig } from "./config/load";
import { destinationRenderers } from "./destinations/renderers";
import { renderersFor } from "./mirror/renderers";

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
  readonly destinations?: readonly DestinationConfig[];
};

/**
 * The pool, and the drivers the host keeps a handle on: it drives the mirror
 * writer and the delivery runner itself, and the blob store owns the layout a
 * rendering has to ask about.
 */
export type OpenPool = {
  readonly pool: Pool;
  readonly blobs: BlobStore;
  readonly mirrorWriter?: MirrorWriter;
  readonly destinations: readonly DestinationAdapter[];
};

export function openPool(options: OpenPoolConfig): OpenPool {
  const blobs = createFilesystemBlobStore({ root: options.assetRoot });

  const renderers = destinationRenderers();
  const destinations = (options.destinations ?? []).map((destination) =>
    createFilesystemDestination({
      id: destination.id,
      root: destination.root,
      accepts: destination.accepts,
      renderers,
    }),
  );

  const mirrorWriter =
    options.mirrorRoot === undefined
      ? undefined
      : createFilesystemMirrorWriter({
          root: options.mirrorRoot,
          // The blob layout is the blob driver's, so a rendering that points at
          // one asks rather than composing a second copy of the scheme.
          renderers: renderersFor(blobs.pathFor),
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
    destinations,
  };

  return {
    // A duplicate destination id throws here, which is the only moment it can
    // be caught: a pool with two of one id could not say which a record meant.
    pool: createPool(options.config, ports),
    blobs,
    ...(mirrorWriter === undefined ? {} : { mirrorWriter }),
    destinations,
  };
}
