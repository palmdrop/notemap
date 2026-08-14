import type { PoolConfig } from "../types/api/config";
import type { Pool } from "../types/api/pool";
import type { PoolPorts } from "../types/api/ports";
import type { OrderedPage, PageRequest, ReadOrder } from "../types/result";

import * as archive from "./archive";
import * as assets from "./assets";
import { capture } from "./capture";
import * as maintenance from "./maintenance";
import * as mirror from "./mirror";
import * as routing from "./routing";
import * as work from "./work";

/**
 * The methods whose slice is not built yet. Named rather than silently absent,
 * so a host wiring a pool gets the method it asked for or a message saying
 * which one it was.
 */
function notImplemented(method: string): () => never {
  return () => {
    throw new Error(`core: ${method} is not implemented yet`);
  };
}

const DEFAULT_ORDER: ReadOrder = "newest-first";

function ordered<P>(page: PageRequest<P>): OrderedPage<P> {
  return { ...page, order: page.order ?? DEFAULT_ORDER };
}

export function createPool(config: PoolConfig, ports: PoolPorts): Pool {
  const { store } = ports;

  return {
    capture: (envelope) => capture(config, ports, envelope),

    items: {
      get: (id) => store.item(id),
      edit: notImplemented("items.edit"),
      tag: notImplemented("items.tag"),
      untag: notImplemented("items.untag"),
      archive: (id, reason) => archive.archive(ports, id, reason),
      unarchive: (id) => archive.unarchive(ports, id),
      purge: notImplemented("items.purge"),
    },

    views: {
      feed: (page) => store.feed(ordered(page)),
      // Neither takes an order: oldest first is what makes a queue a queue.
      queue: (page) => store.queue(page),
      archived: (page) => store.archived(page),
    },

    suggestions: {
      pendingFor: notImplemented("suggestions.pendingFor"),
      accept: notImplemented("suggestions.accept"),
      reject: notImplemented("suggestions.reject"),
    },

    enrichment: {
      statusOf: notImplemented("enrichment.statusOf"),
      request: notImplemented("enrichment.request"),
      artifactsFor: notImplemented("enrichment.artifactsFor"),
      correct: notImplemented("enrichment.correct"),
    },

    routing: {
      destinations: notImplemented("routing.destinations"),
      route: notImplemented("routing.route"),
      markProcessed: (item, note) => routing.markProcessed(ports, item, note),
      recordsFor: (item) => routing.recordsFor(ports, item),
    },

    assets: {
      store: (bytes, meta) => assets.store(ports, bytes, meta),
      get: (id) => assets.get(ports, id),
      open: (id, signal) => assets.open(ports, id, signal),
      verify: (id) => assets.verify(ports, id),
    },

    work: {
      claim: (request) => work.claim(ports, request),
      complete: (lease, outcome) =>
        work.complete(config, ports, lease, outcome),
      extend: (lease, by) => work.extend(ports, lease, by),
      release: (lease) => work.release(ports, lease),
      abandoned: (page) => work.abandoned(ports, page),
    },

    mirror: { recordFor: (item) => mirror.recordFor(ports, item) },

    actions: {
      forItem: (item, page) => store.actions({ item }, ordered(page)),
      all: (page) => store.actions({}, ordered(page)),
      clear: notImplemented("actions.clear"),
    },

    sync: { changesSince: notImplemented("sync.changesSince") },

    maintenance: {
      verifyMirror: notImplemented("maintenance.verifyMirror"),
      repairMirror: notImplemented("maintenance.repairMirror"),
      sweepUnreferencedAssets: () =>
        maintenance.sweepUnreferencedAssets(config, ports),
    },

    close: () => store.close(),
  };
}
