import type { Asset } from "./asset";
import type { DestinationRecord } from "./destination";
import type { Artifact } from "./enrichment";
import type { DestinationId, ItemId, Timestamp } from "./ids";
import type { ItemRecord } from "./item";
import type { RoutingRecord } from "./routing";

/**
 * What one mirror record is about. A routing record is never one: it is part of
 * the item's record rather than a unit of its own.
 */
export type MirrorSubject =
  | { readonly kind: "item"; readonly item: ItemId }
  | { readonly kind: "destination"; readonly destination: DestinationId };

/**
 * One item's complete durable state: everything a rebuild needs to restore it,
 * and nothing else.
 *
 * An `ItemRecord` rather than an `Item`, so derived state has no way in: a
 * mirrored `supersededBy` could disagree with the chain it was rebuilt from.
 */
export type ItemMirrorRecord = {
  readonly kind: "item";
  readonly item: ItemRecord;
  /** Every asset the payload's and the artifacts' references reach, resolved. */
  readonly assets: readonly Asset[];
  readonly artifacts: readonly Artifact[];
  readonly routing: readonly RoutingRecord[];
  /** Compared by verify, never restored. */
  readonly modifiedAt: Timestamp;
};

/**
 * The mirror's one non-item unit. A delivered routing record names a
 * destination, so a mirror carrying only items would rebuild a pool whose
 * records refer to destinations it cannot produce. Retired ones are carried,
 * because being retired is exactly the state of a destination records still
 * name.
 */
export type DestinationMirrorRecord = {
  readonly kind: "destination";
  readonly destination: DestinationRecord;
  /** Compared by verify, never restored. */
  readonly modifiedAt: Timestamp;
};

export type MirrorRecord = ItemMirrorRecord | DestinationMirrorRecord;
