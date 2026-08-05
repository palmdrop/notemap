import type { Agent } from "./agent";
import type { ItemId, SourceId, TagName, Timestamp } from "./ids";
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

/** What core submits to be written. Excludes every field the store owns or derives. */
export type ItemRecord = {
  readonly id: ItemId;
  readonly source: SourceId;
  readonly sourceItemId: string;
  readonly payload: Payload; // HMM... not sure
  readonly tags: readonly Tag[];
  readonly createdAt: Timestamp;
  readonly contentUpdatedAt?: Timestamp;
  readonly revisionOf?: ItemId;
  readonly archived?: ArchiveState;
};

export type Item = ItemRecord & {
  readonly modifiedAt: Timestamp;
  readonly supersededBy?: ItemId;
};

export type EditOutcome =
  | { readonly kind: "amended"; readonly item: Item }
  | {
      readonly kind: "revised";
      readonly revision: Item;
      readonly supersedes: ItemId;
    };
