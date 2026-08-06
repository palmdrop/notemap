import type {
  AssetStore,
  Clock,
  DestinationAdapter,
  IdGenerator,
  MirrorReader,
  MirrorWriter,
  Pool,
  PoolConfig,
  PoolStore,
  SchemaValidator,
} from "../types";

/** Everything a pool reaches the outside world through. Core sources none of it. */
export type PoolPorts = {
  readonly store: PoolStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly schemas: SchemaValidator;
  readonly assets: AssetStore;
  readonly mirrorWriter: MirrorWriter;
  readonly mirrorReader: MirrorReader;
  readonly destinations: readonly DestinationAdapter[];
};

function notImplemented(): never {
  throw new Error("not implemented");
}

export function stubStore(): PoolStore {
  return {
    transaction: notImplemented,
    item: notImplemented,
    head: notImplemented,
    itemBySourceIdentity: notImplemented,
    revisionChain: notImplemented,
    tombstone: notImplemented,
    feed: notImplemented,
    queue: notImplemented,
    archived: notImplemented,
    suggestions: notImplemented,
    suggestion: notImplemented,
    routingRecords: notImplemented,
    artifacts: notImplemented,
    enrichmentStates: notImplemented,
    abandonedEnrichments: notImplemented,
    unreferencedAssets: notImplemented,
    actions: notImplemented,
    changesSince: notImplemented,
    claim: notImplemented,
    extendLease: notImplemented,
    releaseLease: notImplemented,
    close: notImplemented,
  };
}

export function stubPorts(): PoolPorts {
  return {
    store: stubStore(),
    clock: { now: notImplemented },
    ids: { next: notImplemented },
    schemas: { validate: notImplemented },
    assets: {
      store: notImplemented,
      open: notImplemented,
      verify: notImplemented,
      release: notImplemented,
    },
    mirrorWriter: { write: notImplemented, remove: notImplemented },
    mirrorReader: {
      items: notImplemented,
      artifacts: notImplemented,
      routingRecords: notImplemented,
    },
    destinations: [],
  };
}

/**
 * Every operation throws. The parameters are ignored but declared, because the
 * shape a pool is constructed from is itself part of what the tests specify.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createStubPool(config: PoolConfig, ports: PoolPorts): Pool {
  return {
    capture: notImplemented,
    items: {
      get: notImplemented,
      edit: notImplemented,
      tag: notImplemented,
      untag: notImplemented,
      archive: notImplemented,
      unarchive: notImplemented,
      purge: notImplemented,
    },
    views: {
      feed: notImplemented,
      queue: notImplemented,
      archived: notImplemented,
    },
    suggestions: {
      pendingFor: notImplemented,
      accept: notImplemented,
      reject: notImplemented,
    },
    enrichment: {
      statusOf: notImplemented,
      request: notImplemented,
      artifactsFor: notImplemented,
      correct: notImplemented,
      abandoned: notImplemented,
    },
    routing: {
      destinations: notImplemented,
      route: notImplemented,
      markProcessed: notImplemented,
      recordsFor: notImplemented,
    },
    assets: {
      store: notImplemented,
      get: notImplemented,
      open: notImplemented,
      verify: notImplemented,
    },
    work: {
      claim: notImplemented,
      complete: notImplemented,
      extend: notImplemented,
      release: notImplemented,
    },
    actions: {
      forItem: notImplemented,
      all: notImplemented,
      clear: notImplemented,
    },
    sync: { changesSince: notImplemented },
    maintenance: {
      rebuildFromMirror: notImplemented,
      verifyMirror: notImplemented,
      repairMirror: notImplemented,
      sweepUnreferencedAssets: notImplemented,
    },
    close: notImplemented,
  };
}
