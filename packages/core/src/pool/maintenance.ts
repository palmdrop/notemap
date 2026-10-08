import type { PoolConfig } from "#types/api/config";
import type { PoolPorts } from "#types/api/ports";
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
 *
 * **This never takes an output.** An output is named by a routing record rather
 * than by an asset, so the store withholds a blob a record names even where its
 * last asset has gone.
 */
export async function sweepUnreferencedAssets(
  config: PoolConfig,
  ports: PoolPorts,
): Promise<readonly AssetId[]> {
  const at = ports.clock.now();
  const olderThan = new Date(
    Date.parse(at) - config.sweep.grace,
  ).toISOString() as Timestamp;

  const swept = await ports.store.transaction(async (tx) => {
    const assets = await tx.unreferencedAssets(olderThan, PER_RUN);
    if (assets.length === 0) {
      return { assets, blobs: [] as readonly BlobHash[] };
    }

    const blobs = await tx.deleteAssets(assets);

    // One entry per run, not per asset: a large sweep must not bury the log it
    // shares with captures.
    await tx.appendAction({
      id: ports.ids.next<ActionId>(),
      kind: "assets-released",
      by: { kind: "notemap" },
      at,
      detail: { assets: [...assets], blobs: [...blobs] },
    });

    return { assets, blobs };
  });

  // Outside the transaction, and after it: a crash here leaks a file, where the
  // other order would take bytes an asset still names.
  for (const blob of swept.blobs) await ports.blobs.delete(blob);

  return swept.assets;
}

/**
 * Measures every picture held without dimensions, a page at a time, each in a
 * transaction of its own so a large backlog never holds the write lock for
 * long. One whose bytes cannot say is passed over, and asked again next time:
 * a picture is never marked as unmeasurable, since a better reader might
 * manage it. Answers how many it measured.
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
      const bytes = await ports.blobs.open(asset.blob, signal);
      const dimensions =
        bytes === undefined ? undefined : measure(await headOf(bytes));
      if (dimensions === undefined) continue;

      await ports.store.transaction((tx) =>
        tx.measureAsset(asset.id, dimensions),
      );
      measured += 1;
    }

    after = page.at(-1)?.id;
  }
}
