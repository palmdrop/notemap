import type { PoolPorts } from "../testing/stub-pool";
import type { Agent, ItemId, Pool, PoolConfig, Timestamp } from "../types";

function notImplemented(): never {
  throw new Error("not implemented");
}


export function createPool(config: PoolConfig, ports: PoolPorts): Pool {
  const { store } = ports;


  return {
    capture: async (envelope) => {
      const agent: Agent = {
        kind: 'source',
        source: envelope.source
      };

      // Not sure I like this flow - using a generic command for all mutations instead of clear store.append or store.update methods
      const result = await store.apply({
        command: {
          kind: "append-capture",
          item: {
            ...envelope,
            id: envelope.id ?? ports.ids.next<ItemId>(),
            createdAt: new Date().toISOString() as Timestamp,
            tags: (envelope.tags ?? []).map(tagName => ({
              name: tagName,
              addedAt: envelope.capturedAt,
              by: agent
            }
            )),
          },
          jobs: [],
          references: [],
        },
        preconditions: [],
        // NOTE: Do not like that the caller needs to feed actions to the mutation... the PoolStore should derive that itself
        actions: []
      });

      return result;
    },
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
  };
}
