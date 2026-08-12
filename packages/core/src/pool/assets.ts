import { ok, refused } from "../utils/result";
import type { PoolPorts } from "../types/api/ports";
import type { AssetRefusal } from "../types/api/refusal";
import type { Asset, AssetMeta, BlobIntegrity } from "../types/domain/asset";
import type { AssetId } from "../types/domain/ids";
import type { Result } from "../types/result";

/**
 * The bytes are written before the transaction opens, so nothing awaits a disk
 * while the store holds its write lock. A crash between the two leaves a blob
 * no asset names — space, which the next identical upload reuses.
 */
export async function store(
  ports: PoolPorts,
  bytes: AsyncIterable<Uint8Array>,
  meta: AssetMeta,
): Promise<Result<Asset, AssetRefusal>> {
  const blob = await ports.blobs.put(bytes);

  const asset: Asset = {
    id: ports.ids.next<AssetId>(),
    filename: meta.filename,
    mime: meta.mime,
    blob: blob.hash,
    bytes: blob.bytes,
  };

  await ports.store.transaction((tx) => tx.insertAsset(asset));

  return ok(asset);
}

export function get(ports: PoolPorts, id: AssetId): Promise<Asset | undefined> {
  return ports.store.asset(id);
}

/** Does not rehash: answering an `<img>` cannot afford it, so drift is `verify`'s to find. */
export async function open(
  ports: PoolPorts,
  id: AssetId,
  signal?: AbortSignal,
): Promise<Result<AsyncIterable<Uint8Array>, AssetRefusal>> {
  const asset = await ports.store.asset(id);
  if (asset === undefined) return refused({ kind: "no-such-asset", asset: id });

  const bytes = await ports.blobs.open(asset.blob, signal);
  if (bytes === undefined) {
    return refused({ kind: "blob-missing", blob: asset.blob });
  }

  return ok(bytes);
}

/** An asset nobody minted and a blob nobody kept are the same answer: the bytes are not there. */
export async function verify(
  ports: PoolPorts,
  id: AssetId,
): Promise<BlobIntegrity> {
  const asset = await ports.store.asset(id);
  return asset === undefined ? "missing" : ports.blobs.verify(asset.blob);
}
