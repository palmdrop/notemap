import type { PoolConfig } from "#types/api/config";
import type { Pool } from "#types/api/pool";
import type { PoolPorts } from "#types/api/ports";
import type { OrderedPage, PageRequest, ReadOrder } from "#types/result";

import * as archive from "./archive";
import * as assets from "./assets";
import * as destinations from "./destinations";
import { capture } from "./capture";
import { edit } from "./edit";
import * as maintenance from "./maintenance";
import * as mirror from "./mirror";
import * as routing from "./routing";
import * as tags from "./tags";
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

function ordered<P>(page: PageRequest<P>, fallback: ReadOrder): OrderedPage<P> {
  return { ...page, order: page.order ?? fallback };
}

export function createPool(config: PoolConfig, ports: PoolPorts): Pool {
  const { store } = ports;

  return {
    identity: () => store.identity(),

    capture: (envelope) => capture(config, ports, envelope),

    items: {
      get: (id) => store.item(id),
      edit: (id, envelope, by) => edit(config, ports, id, envelope, by),
      tag: (id, name, by) => tags.tag(ports, id, name, by),
      untag: (id, name, by) => tags.untag(ports, id, name, by),
      archive: (id, reason) => archive.archive(ports, id, reason),
      unarchive: (id) => archive.unarchive(ports, id),
      purge: notImplemented("items.purge"),
    },

    views: {
      feed: (page) => store.feed(ordered(page, "newest-first")),
      queue: (page) => store.queue(ordered(page, "oldest-first")),
      archived: (page) => store.archived(ordered(page, "oldest-first")),
    },

    tags: { inUse: () => store.tagsInUse() },

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

    destinations: {
      list: () => destinations.list(ports),
      describe: (id, signal) => destinations.describe(ports, id, signal),
      candidates: (id, request, signal) =>
        destinations.candidates(ports, id, request, signal),
      probe: (id, signal) => destinations.probe(ports, id, signal),
      remembered: (id, request) => destinations.remembered(ports, id, request),
      kinds: () => ports.destinations.kinds(),
      create: (draft) => destinations.create(ports, draft),
      edit: (id, changes) => destinations.edit(ports, id, changes),
      retire: (id) => destinations.retire(ports, id),
      unretire: (id) => destinations.unretire(ports, id),
      delete: (id) => destinations.remove(ports, id),
    },

    routing: {
      route: (item, delivery, signal) =>
        routing.route(ports, item, delivery, signal),
      deliveryFor: (record) => routing.deliveryFor(ports, record),
      cancelDelivery: (record) => routing.cancelDelivery(ports, record),
      markProcessed: (item, note) => routing.markProcessed(ports, item, note),
      recordsFor: (item) => routing.recordsFor(ports, item),
      openOutput: (record, signal) => routing.openOutput(ports, record, signal),
    },

    assets: {
      store: (id, bytes, meta) => assets.store(ports, id, bytes, meta),
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

    mirror: { recordFor: (subject) => mirror.recordFor(ports, subject) },

    actions: {
      forItem: (item, page) =>
        store.actions({ item }, ordered(page, "newest-first")),
      all: (page) => store.actions({}, ordered(page, "newest-first")),
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
