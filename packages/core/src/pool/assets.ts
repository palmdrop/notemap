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

import { isPicture, keepingHead, measure } from "./pictures";

type StoreResult = Result<AssetOutcome, AssetStoreRefusal>;

/**
 * The bytes are written before the transaction opens, so nothing awaits a
 * stream while the store holds its write lock. A crash between the two — or a
 * refused id — leaves a blob no asset names, which the reclaim takes once the
 * grace window has passed.
 */
export async function store(
  ports: PoolPorts,
  id: AssetId,
  bytes: AsyncIterable<Uint8Array>,
  meta: AssetMeta,
): Promise<StoreResult> {
  const picture = isPicture(meta.mime) ? keepingHead(bytes) : undefined;
  const blob = await ports.blobs.put(picture?.bytes ?? bytes);
  const dimensions =
    picture === undefined ? undefined : measure(picture.head());

  const arriving: Asset = {
    id,
    filename: meta.filename,
    mime: meta.mime,
    blob: blob.hash,
    bytes: blob.bytes,
    ...(dimensions === undefined ? {} : { dimensions }),
  };

  return ports.store.transaction((tx) => insert(ports, tx, arriving));
}

async function insert(
  ports: PoolPorts,
  tx: PoolTx,
  arriving: Asset,
): Promise<StoreResult> {
  const held = await tx.asset(arriving.id);
  if (held !== undefined) {
    if (!isSame(held, arriving)) {
      return refused({ kind: "asset-id-conflict", asset: arriving.id });
    }
    if (held.dimensions === undefined && arriving.dimensions !== undefined) {
      await tx.measureAsset(held.id, arriving.dimensions);
      return ok({
        kind: "already-stored",
        asset: { ...held, dimensions: arriving.dimensions },
      });
    }
    return ok({ kind: "already-stored", asset: held });
  }

  // Bytes already held were reused rather than written, and a reclaim may have
  // taken them since. The stream is spent, so the uploader has to send it again.
  if ((await ports.blobs.open(arriving.blob)) === undefined) {
    throw new Error(
      `blob ${arriving.blob} was reclaimed while ${arriving.id} was being stored`,
    );
  }

  await tx.insertAsset(arriving);
  return ok({ kind: "stored", asset: arriving });
}

/** `bytes` and `dimensions` are not compared: they come from the blob, so equal hashes agree on them. */
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
