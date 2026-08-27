import type { Asset } from "#types/domain/asset";
import type { Destination } from "#types/domain/destination";
import type { Artifact } from "#types/domain/enrichment";
import type { Timestamp } from "#types/domain/ids";
import type { Item, ItemRecord, Tag } from "#types/domain/item";
import type {
  DestinationMirrorRecord,
  ItemMirrorRecord,
} from "#types/domain/mirror";
import type { Payload } from "#types/domain/payload";
import type { RoutingRecord } from "#types/domain/routing";

/**
 * One item's durable state, in the one form the mirror stores it in.
 *
 * Canonical here rather than at the byte layer: every instant gets its single
 * spelling and every unordered collection its single order, so two projections
 * of one state are equal as values and not merely as bytes.
 */
export function projectMirrorRecord(
  item: Item,
  assets: readonly Asset[],
  artifacts: readonly Artifact[],
  routing: readonly RoutingRecord[],
): ItemMirrorRecord {
  return {
    kind: "item",
    item: canonicalItem(item),
    assets: [...assets].sort(byKey((asset) => asset.id)),
    artifacts: [...artifacts]
      .map(canonicalArtifact)
      .sort(byKey((artifact) => artifact.id)),
    // A rebuild that restored a reservation would restore a promise no job exists to keep.
    routing: routing
      .filter((entry) => entry.state === "delivered")
      .map(canonicalRouting)
      .sort(byKey((entry) => entry.id)),
    modifiedAt: instant(item.modifiedAt),
  };
}

/** A destination's durable state. Nothing about it is unordered, so only its instants are canonicalised. */
export function projectDestinationRecord(
  destination: Destination,
): DestinationMirrorRecord {
  const { modifiedAt, ...record } = destination;

  return {
    kind: "destination",
    destination: {
      ...record,
      ...(record.retiredAt === undefined
        ? {}
        : { retiredAt: instant(record.retiredAt) }),
      createdAt: instant(record.createdAt),
    },
    modifiedAt: instant(modifiedAt),
  };
}

/**
 * Field by field, and never a spread of what it was handed: an `Item` satisfies
 * `ItemRecord` structurally, so a spread carries whatever the store derived and
 * a rebuild restores it as though the pool had stated it.
 */
function canonicalItem(item: Item): ItemRecord {
  return {
    id: item.id,
    source: item.source,
    sourceItemId: item.sourceItemId,
    payload: canonicalPayload(item.payload),
    tags: [...item.tags].map(canonicalTag).sort(byKey((tag) => tag.name)),
    createdAt: instant(item.createdAt),
    ...(item.contentUpdatedAt === undefined
      ? {}
      : { contentUpdatedAt: instant(item.contentUpdatedAt) }),
    ...(item.revisionOf === undefined ? {} : { revisionOf: item.revisionOf }),
    ...(item.archived === undefined
      ? {}
      : {
          archived: {
            ...item.archived,
            archivedAt: instant(item.archived.archivedAt),
          },
        }),
  };
}

function canonicalPayload(payload: Payload): Payload {
  return {
    ...payload,
    assets: [...payload.assets].sort(byKey((ref) => ref.slot)),
  };
}

function canonicalTag(tag: Tag): Tag {
  return { ...tag, addedAt: instant(tag.addedAt) };
}

function canonicalArtifact(artifact: Artifact): Artifact {
  return {
    ...artifact,
    createdAt: instant(artifact.createdAt),
    assets: [...artifact.assets].sort(byKey((ref) => ref.slot)),
  };
}

function canonicalRouting(entry: RoutingRecord): RoutingRecord {
  return { ...entry, at: instant(entry.at) };
}

/** A timestamp is an instant, not a spelling: `09:00:00Z` and `09:00:00.000Z` are one value. */
function instant(value: Timestamp): Timestamp {
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) {
    throw new TypeError(`not a parseable timestamp: ${value}`);
  }
  return new Date(millis).toISOString() as Timestamp;
}

function byKey<T>(of: (value: T) => string): (a: T, b: T) => number {
  return (a, b) => {
    const left = of(a);
    const right = of(b);
    return left < right ? -1 : left > right ? 1 : 0;
  };
}
