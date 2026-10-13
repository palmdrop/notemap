import type { PoolConfig } from "#types/api/config";
import type { PoolPorts } from "#types/api/ports";
import type {
  MeasuredStorage,
  RecordedStorage,
  Tally,
} from "#types/domain/storage";

import { pastGrace } from "./maintenance";

const NOTHING: Tally = { count: 0, bytes: 0 };

/**
 * What the pool has written down about its own bytes. Two reads and no walk, so
 * a surface may ask on sight.
 *
 * The assets are summed as the registry holds them, so two assets naming one
 * blob are counted twice; `measure` counts the blob once. The difference is
 * what content addressing saved, and is left to whoever holds both figures.
 */
export async function recorded(ports: PoolPorts): Promise<RecordedStorage> {
  const [store, assets] = await Promise.all([
    ports.store.footprint(),
    ports.store.assetsHeld(),
  ]);

  return { store, assets };
}

/**
 * Walks the blob store, splitting the blobs nothing names into what a reclaim
 * would take now and what it would pass over, by the reclaim's own rule — then
 * asks the mirror what it holds. Deletes nothing.
 *
 * Aborted, it throws rather than answering what it had reached: a measurement
 * is read as the whole of something, so half of one is worse than none.
 */
export async function measure(
  config: PoolConfig,
  ports: PoolPorts,
  signal?: AbortSignal,
): Promise<MeasuredStorage> {
  const old = pastGrace(config, ports.clock.now());

  let blobs = NOTHING;
  let reclaimable = NOTHING;
  let withinGrace = NOTHING;

  for await (const blob of ports.blobs.list()) {
    signal?.throwIfAborted();
    blobs = and(blobs, blob.bytes);

    if (await ports.store.blobNamed(blob.hash)) continue;
    if (old(blob.at)) reclaimable = and(reclaimable, blob.bytes);
    else withinGrace = and(withinGrace, blob.bytes);
  }

  const mirror = await ports.mirrorWriter?.footprint(signal);

  return {
    blobs,
    reclaimable,
    withinGrace,
    ...(mirror === undefined ? {} : { mirror }),
  };
}

function and(tally: Tally, bytes: number): Tally {
  return { count: tally.count + 1, bytes: tally.bytes + bytes };
}
