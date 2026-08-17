import type { PoolPorts } from "../../types/api/ports";
import type { Asset } from "../../types/domain/asset";
import type { RoutingRecordId } from "../../types/domain/ids";
import type { Item } from "../../types/domain/item";
import type {
  DeliveredAsset,
  Delivery,
  DeliveryOutcome,
  DeliveryRequest,
} from "../../types/domain/routing";
import type { WorkOutcome } from "../../types/domain/work";

/** The abandoned surface has to keep these apart: only the last warrants checking the destination. */
export const DELIVERY_FAILURE = {
  unreachable: "unreachable",
  rejected: "rejected-by-destination",
  unknown: "delivery-outcome-unknown",
} as const;

export function asDeliveryWorkOutcome(outcome: DeliveryOutcome): WorkOutcome {
  switch (outcome.kind) {
    case "delivered":
      return {
        kind: "delivered",
        ...(outcome.pointer === undefined ? {} : { pointer: outcome.pointer }),
      };
    case "unreachable":
      return {
        kind: "failed",
        retryable: true,
        detail: {
          code: DELIVERY_FAILURE.unreachable,
          detail: outcome.detail,
        },
      };
    case "rejected":
      return {
        kind: "failed",
        retryable: false,
        detail: { code: DELIVERY_FAILURE.rejected, detail: outcome.detail },
      };
  }
}

/** Absent where there is nothing left to carry out: the record was cancelled, or its item purged. */
export async function deliveryFor(
  ports: PoolPorts,
  id: RoutingRecordId,
): Promise<Delivery | undefined> {
  const record = await ports.store.routingRecord(id);
  if (record === undefined || record.target.kind !== "destination") {
    return undefined;
  }

  const item = await ports.store.item(record.item);
  if (item === undefined) return undefined;

  return projectDelivery(ports, item, {
    destination: record.target.destination,
    capability: record.target.capability,
    target: record.target.target,
  });
}

/** Called outside any transaction: this reads assets, and the store holds a write lock throughout one. */
export async function projectDelivery(
  ports: PoolPorts,
  item: Item,
  request: DeliveryRequest,
): Promise<Delivery> {
  const artifacts = await ports.store.artifacts(item.id);
  const references = [
    ...item.payload.assets,
    ...artifacts.flatMap((artifact) => artifact.assets),
  ];

  const assets: DeliveredAsset[] = [];
  const seen = new Set<string>();

  for (const reference of references) {
    const key = `${reference.slot}\u0000${reference.asset}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const asset = await ports.store.asset(reference.asset);
    // A foreign key stands under every reference, so nothing resolvable is dropped here.
    if (asset === undefined) continue;

    assets.push({
      slot: reference.slot,
      asset,
      open: (signal) => openAsset(ports, asset, signal),
    });
  }

  assets.sort(bySlotThenAsset);

  return {
    item: item.id,
    destination: request.destination,
    capability: request.capability,
    target: request.target,
    source: item.source,
    payload: item.payload,
    tags: item.tags,
    createdAt: item.createdAt,
    ...(item.contentUpdatedAt === undefined
      ? {}
      : { contentUpdatedAt: item.contentUpdatedAt }),
    artifacts,
    assets,
  };
}

async function openAsset(
  ports: PoolPorts,
  asset: Asset,
  signal?: AbortSignal,
): Promise<AsyncIterable<Uint8Array>> {
  const bytes = await ports.blobs.open(asset.blob, signal);
  if (bytes === undefined) {
    throw new Error(`the bytes of ${asset.filename} are gone: ${asset.blob}`);
  }
  return bytes;
}

function bySlotThenAsset(left: DeliveredAsset, right: DeliveredAsset): number {
  const key = (each: DeliveredAsset) => `${each.slot}\u0000${each.asset.id}`;
  return key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0;
}
