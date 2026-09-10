import { usability } from "../destinations/usability";
import type { PoolPorts } from "#types/api/ports";
import type { Asset } from "#types/domain/asset";
import type { RoutingRecordId } from "#types/domain/ids";
import type { Item } from "#types/domain/item";
import type { Payload } from "#types/domain/payload";
import type {
  AttemptableDelivery,
  DeliveredAsset,
  Delivery,
  DeliveryOutcome,
  DeliveryRequest,
  RoutingRecord,
} from "#types/domain/routing";
import type { WorkOutcome } from "#types/domain/work";
import type { JsonObject } from "#types/json";

/** The abandoned surface has to keep these apart: only the last warrants checking the destination. */
export const DELIVERY_FAILURE = {
  unreachable: "unreachable",
  rejected: "rejected-by-destination",
  unknown: "delivery-outcome-unknown",
} as const;

/** Where an entry about a record says it was going, for the two places that log one. */
export function destinationDetail(record: RoutingRecord): JsonObject {
  const target = record.target;
  return target.kind === "destination"
    ? { destination: target.destination, capability: target.capability }
    : {};
}

/**
 * Which template a record came from, where one did. `firedByTag` travels with
 * it because the two read differently: a tag filed this, or a person took the
 * template and filed it themselves.
 */
export function templateDetail(record: RoutingRecord): JsonObject {
  const applied = record.applied;
  return applied === undefined
    ? {}
    : { template: applied.template, firedByTag: applied.firedByTag };
}

export function asDeliveryWorkOutcome(outcome: DeliveryOutcome): WorkOutcome {
  switch (outcome.kind) {
    case "delivered":
      return {
        kind: "delivered",
        ...(outcome.pointer === undefined ? {} : { pointer: outcome.pointer }),
        ...(outcome.url === undefined ? {} : { url: outcome.url }),
        // The opener travels as it is: nothing durable holds one, and core
        // reads it into a blob before the transaction that names it.
        ...(outcome.output === undefined ? {} : { output: outcome.output }),
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

/**
 * Absent where there is nothing left to carry out: the record was cancelled,
 * its item purged, or the delivery already landed. The destination is resolved
 * here rather than at the decision, so an edit made after a failure is what the
 * retry runs against.
 */
export async function deliveryFor(
  ports: PoolPorts,
  id: RoutingRecordId,
): Promise<AttemptableDelivery | undefined> {
  const record = await ports.store.routingRecord(id);
  if (
    record === undefined ||
    record.state !== "pending" ||
    record.target.kind !== "destination"
  ) {
    return undefined;
  }

  const item = await ports.store.item(record.item);
  if (item === undefined) return undefined;

  const destination = await ports.store.destination(record.target.destination);
  if (destination === undefined) {
    // Nothing a record names can be deleted, so this is a pool that lost a row.
    return {
      kind: "unusable",
      detail: `${record.target.destination} is no longer in the pool`,
    };
  }

  // Retirement is deliberately not consulted: it stops the next decision, not
  // a delivery already decided.
  const usable = usability(ports, destination);
  if (usable.kind === "unusable") {
    return { kind: "unusable", detail: usable.detail };
  }

  const delivery = await projectDelivery(ports, item, {
    destination: record.target.destination,
    capability: record.target.capability,
    arguments: record.target.arguments,
    ...(record.target.content === undefined
      ? {}
      : { content: record.target.content }),
  });

  return { kind: "ready", destination, delivery };
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
    arguments: request.arguments,
    source: item.source,
    payload: rewritten(item.payload, request.content),
    tags: item.tags,
    createdAt: item.createdAt,
    ...(item.contentUpdatedAt === undefined
      ? {}
      : { contentUpdatedAt: item.contentUpdatedAt }),
    artifacts,
    assets,
  };
}

/**
 * The words go in and nothing else moves: `assets` and `metadata` are the
 * capture's, so a rewrite cannot silently drop a picture.
 */
function rewritten(payload: Payload, content: JsonObject | undefined): Payload {
  return content === undefined ? payload : { ...payload, content };
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
