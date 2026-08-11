import { projectMirrorRecord } from "../mirror/record";
import type { PoolPorts } from "../types/api/ports";
import type { AssetId, ItemId } from "../types/domain/ids";
import type { MirrorRecord } from "../types/domain/mirror";

/**
 * An item's durable state as the mirror would carry it, read fresh.
 *
 * This is a read of the *pool*, not of the mirror: a job carries no snapshot,
 * so whatever writes a mirror file asks for the state at the moment it writes.
 * Nothing here can reach a mirror file.
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

  // A reference names an id and a hash; the filename, media type and size a
  // rebuild needs to restore the same asset identity are the asset store's.
  const referenced = new Set<AssetId>([
    ...item.payload.assets.map((ref) => ref.asset),
    ...artifacts.flatMap((artifact) => artifact.assets.map((ref) => ref.asset)),
  ]);

  const assets = await Promise.all(
    [...referenced].map(async (asset) => {
      const resolved = await ports.assets.get(asset);
      if (resolved === undefined) {
        throw new Error(
          `item ${id} references asset ${asset}, which the asset store does not have`,
        );
      }
      return resolved;
    }),
  );

  return projectMirrorRecord(item, assets, artifacts, routing);
}
