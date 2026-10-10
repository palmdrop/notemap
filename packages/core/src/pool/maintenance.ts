import type { PoolConfig } from "#types/api/config";
import type { PoolPorts } from "#types/api/ports";
import type { Dimensions } from "#types/domain/asset";
import type { ActionId, AssetId, BlobHash, Timestamp } from "#types/domain/ids";

import { headOf, measure } from "./pictures";

/**
 * How many assets one run takes. The store holds a write lock for the length of
 * a transaction, so a large backlog is given up over several runs rather than
 * stalling every write for one.
 */
const PER_RUN = 500;

/**
 * The list is read inside the transaction that deletes it. Read outside, a
 * capture arriving in between would make the delete fail against the foreign
 * key and take the whole run with it.
 */
export async function sweepUnreferencedAssets(
  config: PoolConfig,
  ports: PoolPorts,
): Promise<readonly AssetId[]> {
  const at = ports.clock.now();

  return ports.store.transaction(async (tx) => {
    const assets = await tx.unreferencedAssets(
      graceBefore(config, at),
      PER_RUN,
    );
    if (assets.length === 0) return assets;

    await tx.deleteAssets(assets);

    // One entry per run, not per asset: a large sweep must not bury the log it
    // shares with captures.
    await tx.appendAction({
      id: ports.ids.next<ActionId>(),
      kind: "assets-released",
      by: { kind: "notemap" },
      at,
      detail: { assets: [...assets] },
    });

    return assets;
  });
}

/**
 * A blob that is named, or was put within the grace window, is passed over
 * without the write lock; the rest are asked again under it, each in a
 * transaction of its own, so the lock is held for one `unlink` at a time.
 * Nothing can name a blob between that question and the delete, and whatever
 * names it afterwards finds it gone under the same lock. Answers how many it
 * took, stopped or not.
 */
export async function reclaimUnnamedBlobs(
  config: PoolConfig,
  ports: PoolPorts,
  signal?: AbortSignal,
): Promise<number> {
  const olderThan = Date.parse(graceBefore(config, ports.clock.now()));
  const old = (at: Timestamp | undefined) =>
    at !== undefined && Date.parse(at) <= olderThan;
  let taken = 0;

  for await (const blob of ports.blobs.list()) {
    if (signal?.aborted === true) return taken;
    if (!old(blob.at) || (await ports.store.blobNamed(blob.hash))) continue;

    const took = await ports.store.transaction(async (tx) => {
      if (await tx.blobNamed(blob.hash)) return false;
      if (!old(await ports.blobs.lastPut(blob.hash))) return false;
      await ports.blobs.delete(blob.hash);
      return true;
    });
    if (took) taken += 1;
  }

  return taken;
}

function graceBefore(config: PoolConfig, at: Timestamp): Timestamp {
  return new Date(
    Date.parse(at) - config.sweep.grace,
  ).toISOString() as Timestamp;
}

/**
 * Measures every picture held without dimensions, a page at a time, each in a
 * transaction of its own so a large backlog never holds the write lock for
 * long. One whose bytes cannot say, or cannot be read, is passed over and
 * asked again next time. Answers how many it measured, stopped or not.
 */
export async function measurePictures(
  ports: PoolPorts,
  signal?: AbortSignal,
): Promise<number> {
  let measured = 0;
  let after: AssetId | undefined;

  for (;;) {
    const page = await ports.store.unmeasuredPictures(after, PER_RUN);
    if (page.length === 0) return measured;

    for (const asset of page) {
      if (signal?.aborted === true) return measured;
      const dimensions = await read(ports, asset.blob, signal);
      if (dimensions === undefined) continue;

      await ports.store.transaction((tx) =>
        tx.measureAsset(asset.id, dimensions),
      );
      measured += 1;
    }

    after = page.at(-1)?.id;
  }
}

async function read(
  ports: PoolPorts,
  blob: BlobHash,
  signal: AbortSignal | undefined,
): Promise<Dimensions | undefined> {
  try {
    const bytes = await ports.blobs.open(blob, signal);
    return bytes === undefined ? undefined : measure(await headOf(bytes));
  } catch {
    return undefined;
  }
}
