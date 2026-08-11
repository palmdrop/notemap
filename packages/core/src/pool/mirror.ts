import { MirrorWriteFailure } from "../mirror/failure";
import { projectMirrorRecord } from "../mirror/record";
import type { PoolPorts } from "../types/api/ports";
import type { AssetId, ItemId } from "../types/domain/ids";
import type { MirrorRecord } from "../types/domain/mirror";

/**
 * An item's durable state as the mirror would carry it. A read of the *pool*,
 * not of the mirror: a job carries no snapshot, so a write asks for the state
 * at the moment it writes.
 */
export async function recordFor(
  ports: PoolPorts,
  id: ItemId,
): Promise<MirrorRecord | undefined> {
  const item = await ports.store.item(id);
  if (item === undefined) return undefined;

  const [artifacts, routing] = await Promise.all([
    ports.store.artifacts(id),
    ports.store.routingRecords(id),
  ]);

  const referenced = new Set<AssetId>([
    ...item.payload.assets.map((ref) => ref.asset),
    ...artifacts.flatMap((artifact) => artifact.assets.map((ref) => ref.asset)),
  ]);

  const assets = await Promise.all(
    [...referenced].map(async (asset) => {
      const resolved = await ports.assets.get(asset);
      if (resolved === undefined) {
        // Not retryable: the reference is durable and the blob is not coming
        // back on its own, so retrying forever would hide it from the surface
        // that exists to ask a person for it.
        throw new MirrorWriteFailure(
          "asset-missing",
          `item ${id} references asset ${asset}, which the asset store does not have`,
          false,
        );
      }
      return resolved;
    }),
  );

  return projectMirrorRecord(item, assets, artifacts, routing);
}
