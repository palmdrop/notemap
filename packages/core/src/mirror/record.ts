import type { Asset } from "../types/domain/asset";
import type { Artifact } from "../types/domain/enrichment";
import type { Timestamp } from "../types/domain/ids";
import type { Item, ItemRecord, Tag } from "../types/domain/item";
import type { MirrorRecord } from "../types/domain/mirror";
import type { Payload } from "../types/domain/payload";
import type { RoutingRecord } from "../types/domain/routing";

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
): MirrorRecord {
  const { modifiedAt, supersededBy, ...record } = item;

  return {
    item: canonicalItem(record),
    assets: [...assets].sort(byKey((asset) => asset.id)),
    artifacts: [...artifacts]
      .map(canonicalArtifact)
      .sort(byKey((artifact) => artifact.id)),
    routing: [...routing]
      .map(canonicalRouting)
      .sort(byKey((entry) => entry.id)),
    modifiedAt: instant(modifiedAt),
  };
}

function canonicalItem(record: ItemRecord): ItemRecord {
  return {
    ...record,
    payload: canonicalPayload(record.payload),
    tags: [...record.tags].map(canonicalTag).sort(byKey((tag) => tag.name)),
    createdAt: instant(record.createdAt),
    ...(record.contentUpdatedAt === undefined
      ? {}
      : { contentUpdatedAt: instant(record.contentUpdatedAt) }),
    ...(record.archived === undefined
      ? {}
      : {
          archived: {
            ...record.archived,
            archivedAt: instant(record.archived.archivedAt),
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
