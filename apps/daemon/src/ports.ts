import { dirname } from "node:path";

import { v7 as uuidv7 } from "uuid";

import { createFilesystemBlobStore } from "@notemap/blob-fs";
import {
  ARENA,
  ARENA_ACCOUNT,
  asArenaCredential,
  createArenaDestination,
} from "@notemap/destination-arena";
import { createFilesystemDestination } from "@notemap/destination-fs";
import {
  asWebdavCredential,
  createWebdavDestination,
  transportWarnings,
  WEBDAV,
  WEBDAV_ACCOUNT,
} from "@notemap/destination-webdav";
import { createFilesystemMirrorWriter } from "@notemap/mirror-fs";
import { createAjvSchemaValidator } from "@notemap/schema-ajv";
import { createSqlitePoolStore } from "@notemap/store-sqlite";
import {
  createPool,
  destinationRegistry,
  type BlobStore,
  type Clock,
  type Destinations,
  type IdGenerator,
  type MintableId,
  type MirrorWriter,
  type PayloadTypeName,
  type Pool,
  type PoolConfig,
  type JsonSchema,
  type PoolPorts,
  type Timestamp,
} from "@notemap/core";

import { accountsFor } from "./destinations/credentials";
import { arenaBlocks, destinationRenderers } from "./destinations/renderers";
import { renderersFor } from "./mirror/renderers";
import { createAuth } from "./auth";
import { createSqliteAuthStore } from "./auth/store";
import type { Account } from "./config/load";

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
  /**
   * The accounts a destination may name, whatever kind they are for. An adapter
   * closes over the resolver these make, so a secret reaches neither core nor
   * the pool — and a destination cannot name an address, only one of these.
   */
  readonly accounts?: readonly Account[];
};

/**
 * The pool, and the drivers the host keeps a handle on: it drives the mirror
 * writer and the delivery runner itself, and the blob store owns the layout a
 * rendering has to ask about.
 */
export type OpenPool = {
  readonly pool: Pool;
  readonly ports: PoolPorts;
  readonly blobs: BlobStore;
  readonly mirrorWriter?: MirrorWriter;
  readonly destinations: Destinations;
  /**
   * What the adapters wired here have to say about the accounts they were
   * given. Collected rather than printed, and collected here rather than where
   * it is printed: which kinds exist is this seam's knowledge and nothing
   * else's, so nothing above it names one.
   */
  readonly warnings: readonly string[];
};

export function openPool(options: OpenPoolConfig): OpenPool {
  const blobs = createFilesystemBlobStore({ root: options.assetRoot });

  // Every payload type has a rendering, the fenced-JSON fallback being the
  // floor, so a folder takes everything the pool can hold.
  const everyPayloadType = options.config.payloadTypes.map(
    (type) => type.name as PayloadTypeName,
  );

  // Which paths are the daemon's own is the host's knowledge, not core's and
  // not the adapter's: the pool's directory (its WAL and SHM files live
  // beside it), the mirror and the assets. A vault over any of them is
  // destructive and nobody ever means it.
  const reserved = [
    dirname(options.file),
    options.assetRoot,
    ...(options.mirrorRoot === undefined ? [] : [options.mirrorRoot]),
  ];

  const renderers = destinationRenderers();
  const accounts = options.accounts ?? [];
  const schemas = createAjvSchemaValidator();
  refuseUnusableAccounts(accounts, schemas);

  const webdavAccounts = accounts.filter((account) => account.kind === WEBDAV);
  const arenaAccounts = accounts.filter((account) => account.kind === ARENA);

  const webdavCredentials = accountsFor(WEBDAV, accounts);
  const arenaCredentials = accountsFor(ARENA, accounts);

  const destinations = destinationRegistry([
    createFilesystemDestination({
      renderers,
      accepts: everyPayloadType,
      reserved,
    }),
    createWebdavDestination({
      renderers,
      accepts: everyPayloadType,
      credentials: (name) => webdavCredentials(name).then(asWebdavCredential),
      accounts: webdavAccounts.map((account) => account.name),
    }),
    createArenaDestination({
      // Not `everyPayloadType`: what has a block form is the dialect's to say,
      // and core refuses the rest before a decision is made.
      renderers: arenaBlocks(),
      credentials: (name) => arenaCredentials(name).then(asArenaCredential),
      accounts: arenaAccounts.map((account) => account.name),
    }),
  ]);

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
    schemas,
    blobs,
    ...(mirrorWriter === undefined ? {} : { mirrorWriter }),
    destinations,
  };

  return {
    pool: createPool(options.config, ports),
    ports,
    blobs,
    ...(mirrorWriter === undefined ? {} : { mirrorWriter }),
    destinations,
    // What an account is reached over is the adapter's to judge; the host asks.
    warnings: transportWarnings(
      webdavAccounts.map((account) => ({
        name: account.name,
        baseUrl: String(account["baseUrl"]),
      })),
    ),
  };
}

type OpenAuthConfig = {
  file: string;
};

type OpenAuthPorts = {
  clock: Clock;
};

export const openAuth = (config: OpenAuthConfig, { clock }: OpenAuthPorts) => {
  const store = createSqliteAuthStore({
    file: config.file,
  });

  const auth = createAuth(store, {
    clock,
  });

  return auth;
};

/**
 * What an account of a given kind must carry is that kind's own, and this is
 * where the daemon asks. At startup rather than at the first delivery: a
 * malformed account otherwise fails hours later, on a runner's timer, where
 * nobody is looking.
 *
 * A kind nothing registers is refused too. An account naming one is a typo, and
 * starting anyway would leave a destination that can never deliver.
 */
const ACCOUNT_SCHEMAS: Readonly<Record<string, JsonSchema>> = {
  [WEBDAV]: WEBDAV_ACCOUNT,
  [ARENA]: ARENA_ACCOUNT,
};

export function refuseUnusableAccounts(
  accounts: readonly Account[],
  schemas: PoolPorts["schemas"],
): void {
  for (const account of accounts) {
    const at = `the ${account.kind} account ${account.name}`;
    const schema = ACCOUNT_SCHEMAS[account.kind];

    if (schema === undefined) {
      throw new Error(
        `${at} names a kind nothing speaks — the kinds that hold an account are ${Object.keys(ACCOUNT_SCHEMAS).join(" and ")}`,
      );
    }

    const issues = schemas.validate(schema, account);
    if (issues.length > 0) {
      const said = issues
        .map((issue) => `${issue.path || "(root)"} ${issue.keyword}`)
        .join("; ");
      throw new Error(`${at} is not a ${account.kind} account: ${said}`);
    }
  }
}
