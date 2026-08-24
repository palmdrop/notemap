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

/** As much of an item's routing as a surface reading a page of them can carry. */
export type RoutingSummary = {
  readonly records: number;
  readonly pending: number;
  /** Distinct, in the order the records were made. */
  readonly to: readonly RoutedTo[];
};

/** One tag, and how much of the pool carries it. Every item carrying it is counted. */
export type TagUse = {
  readonly name: TagName;
  readonly items: number;
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
  /** The revisions made from it, empty where there are none. Derived, never stored. */
  readonly revisedInto: readonly ItemId[];
  /** Absent where the item has never been routed. Derived, like `revisedInto`. */
  readonly routing?: RoutingSummary;
};

export type EditOutcome =
  | { readonly kind: "amended"; readonly item: Item }
  | {
      readonly kind: "revised";
      readonly revision: Item;
      readonly revisionOf: ItemId;
    };
