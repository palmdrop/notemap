import type { PoolConfig } from "#types/api/config";
import type { PoolPorts } from "#types/api/ports";
import type { ActionId, AssetId, BlobHash, Timestamp } from "#types/domain/ids";

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
 * **This never takes an output.** It reclaims assets nothing references, and an
 * output is named by a routing record rather than by an asset — so the store
 * withholds a blob a record names even where its last asset has gone. Nothing
 * releases an output today: only a delivered record carries one, and a
 * delivered record is never removed.
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
