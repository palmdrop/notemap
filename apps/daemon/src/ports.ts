import { v7 as uuidv7 } from "uuid";

import { createAjvSchemaValidator } from "@notemap/schema-ajv";
import { createSqlitePoolStore } from "@notemap/store-sqlite";
import {
  createPool,
  type AssetStore,
  type Clock,
  type IdGenerator,
  type MintableId,
  type MirrorReader,
  type MirrorWriter,
  type Pool,
  type PoolConfig,
  type PoolPorts,
  type Timestamp,
} from "@notemap/core";

export const systemClock: Clock = {
  now: () => new Date().toISOString() as Timestamp,
};

/** Time-ordered, as `core.md` encourages; nothing in the model depends on it. */
export const uuidV7Ids: IdGenerator = {
  next: <T extends MintableId>() => uuidv7() as T,
};

/**
 * The ports with no adapter yet. They throw rather than doing nothing, because
 * nothing can reach them: there are no asset endpoints, and no mirror job can
 * be claimed until the store implements `claim()`. A silent no-op here would
 * turn "unbuilt" into "quietly lossy" the moment one of them becomes reachable.
 */
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

const noMirrorWriter: MirrorWriter = {
  write: () => absent("mirror writer"),
  remove: () => absent("mirror writer"),
};

const noMirrorReader: MirrorReader = {
  items: () => absent("mirror reader"),
  artifacts: () => absent("mirror reader"),
  routingRecords: () => absent("mirror reader"),
};

/**
 * The host's whole job: source the configuration, build the adapters, hand them
 * to core. Nothing reaches the pool except through what this returns.
 */
export function openPool(file: string, config: PoolConfig): Pool {
  const ports: PoolPorts = {
    store: createSqlitePoolStore({ file, clock: systemClock }),
    clock: systemClock,
    ids: uuidV7Ids,
    schemas: createAjvSchemaValidator(),
    assets: noAssets,
    mirrorWriter: noMirrorWriter,
    mirrorReader: noMirrorReader,
    destinations: [],
  };

  return createPool(config, ports);
}
