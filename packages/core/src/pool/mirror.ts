import { projectMirrorRecord } from "../mirror/record";
import type { PoolPorts } from "../types/api/ports";
import type { Asset } from "../types/domain/asset";
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

  const resolved = await Promise.all(
    [...referenced].map((asset) => ports.store.asset(asset)),
  );

  // A foreign key stands under every reference, so an unresolved one is
  // unreachable. Projecting a record is not where an inconsistency would be
  // worth discovering: it would fail every mirror write for that item forever.
  const assets = resolved.filter(
    (asset): asset is Asset => asset !== undefined,
  );

  return projectMirrorRecord(item, assets, artifacts, routing);
}
