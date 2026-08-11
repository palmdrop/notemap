import { v7 as uuidv7 } from "uuid";

import { createFilesystemMirrorWriter } from "@notemap/mirror-fs";
import { createAjvSchemaValidator } from "@notemap/schema-ajv";
import { createSqlitePoolStore } from "@notemap/store-sqlite";
import {
  createPool,
  type AssetStore,
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

/** Throws rather than no-ops, so an unbuilt port cannot become a quietly lossy one. */
function absent(port: string): never {
  throw new Error(`the daemon wires no ${port} yet`);
}

const noAssets: AssetStore = {
  store: () => absent("asset store"),
  get: () => absent("asset store"),
  open: () => absent("asset store"),
  verify: () => absent("asset store"),
  release: () => absent("asset store"),
};

/**
 * The pool, and the mirror writer it was wired with. The host keeps the writer
 * because the host is what drives it: core records that a write is owed and
 * never performs one.
 */
export type OpenPool = {
  readonly pool: Pool;
  readonly mirrorWriter?: MirrorWriter;
};

export function openPool(
  file: string,
  config: PoolConfig,
  mirrorRoot?: string,
): OpenPool {
  // No root configured is the mirror disabled, and then capture enqueues
  // nothing rather than piling up work no writer will ever claim.
  const mirrorWriter =
    mirrorRoot === undefined
      ? undefined
      : createFilesystemMirrorWriter({
          root: mirrorRoot,
          renderers: RENDERERS,
        });

  const store = createSqlitePoolStore({ file, clock: systemClock });

  const ports: PoolPorts = {
    store,
    work: store,
    clock: systemClock,
    ids: uuidV7Ids,
    schemas: createAjvSchemaValidator(),
    assets: noAssets,
    ...(mirrorWriter === undefined ? {} : { mirrorWriter }),
    destinations: [],
  };

  return {
    pool: createPool(config, ports),
    ...(mirrorWriter === undefined ? {} : { mirrorWriter }),
  };
}
