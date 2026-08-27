import { ok, refused } from "#utils/result";
import type { PoolPorts, PoolTx } from "#types/api/ports";
import type { AssetRefusal, AssetStoreRefusal } from "#types/api/refusal";
import type {
  Asset,
  AssetMeta,
  AssetOutcome,
  BlobIntegrity,
} from "#types/domain/asset";
import type { AssetId } from "#types/domain/ids";
import type { Result } from "#types/result";

type StoreResult = Result<AssetOutcome, AssetStoreRefusal>;

/**
 * The bytes are written before the transaction opens, so nothing awaits a disk
 * while the store holds its write lock. A crash between the two — or a refused
 * id — leaves a blob no asset names: space, which no sweep reclaims and the
 * next identical upload reuses.
 */
export async function store(
  ports: PoolPorts,
  id: AssetId,
  bytes: AsyncIterable<Uint8Array>,
  meta: AssetMeta,
): Promise<StoreResult> {
  const blob = await ports.blobs.put(bytes);

  const arriving: Asset = {
    id,
    filename: meta.filename,
    mime: meta.mime,
    blob: blob.hash,
    bytes: blob.bytes,
  };

  return ports.store.transaction((tx) => insert(tx, arriving));
}

async function insert(tx: PoolTx, arriving: Asset): Promise<StoreResult> {
  const held = await tx.asset(arriving.id);
  if (held !== undefined) {
    return isSame(held, arriving)
      ? ok({ kind: "already-stored", asset: held })
      : refused({ kind: "asset-id-conflict", asset: arriving.id });
  }

  await tx.insertAsset(arriving);
  return ok({ kind: "stored", asset: arriving });
}

/** `bytes` is not compared: it comes from the blob, so equal hashes agree on it. */
function isSame(held: Asset, arriving: Asset): boolean {
  return (
    held.blob === arriving.blob &&
    held.filename === arriving.filename &&
    held.mime === arriving.mime
  );
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
