import type { Agent } from "./agent";
import type {
  DestinationId,
  ItemId,
  SourceId,
  TagName,
  Timestamp,
} from "./ids";
import type { Payload } from "./payload";

export type Tag = {
  readonly name: TagName;
  readonly by: Agent;
  readonly addedAt: Timestamp;
};

export type ArchiveState = {
  readonly archivedAt: Timestamp;
  readonly reason?: string;
};

export type RoutedTo =
  | { readonly kind: "destination"; readonly destination: DestinationId }
  | { readonly kind: "user" };

/**
 * Where an item went, as much of it as a surface can carry per row. The records
 * themselves are read one item at a time; this says that there are some, that
 * one may not have landed, and where they were aimed.
 */
export type RoutingSummary = {
  readonly records: number;
  readonly pending: number;
  /** Distinct, in the order the records were made. */
  readonly to: readonly RoutedTo[];
};

/** One tag, and how much of the pool carries it. Superseded items are not counted. */
export type TagUse = {
  readonly name: TagName;
  readonly items: number;
  readonly lastUsedAt: Timestamp;
};

/** What core submits to be written. Excludes every field the store owns or derives. */
export type ItemRecord = {
  readonly id: ItemId;
  readonly source: SourceId;
  readonly sourceItemId: string;
  readonly payload: Payload;
  readonly tags: readonly Tag[];
  readonly createdAt: Timestamp;
  readonly contentUpdatedAt?: Timestamp;
  readonly revisionOf?: ItemId;
  readonly archived?: ArchiveState;
};

export type Item = ItemRecord & {
  readonly modifiedAt: Timestamp;
  readonly supersededBy?: ItemId;
  /** Absent where the item has never been routed. Derived, like `supersededBy`. */
  readonly routing?: RoutingSummary;
};

export type EditOutcome =
  | { readonly kind: "amended"; readonly item: Item }
  | {
      readonly kind: "revised";
      readonly revision: Item;
      readonly supersedes: ItemId;
    };
