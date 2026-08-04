import type { ItemId, SyncCursor, Timestamp } from "./ids";
import type { Item } from "./item";

export type Tombstone = {
  readonly item: ItemId;
  readonly purgedAt: Timestamp;
};

export type Delta = {
  readonly changed: readonly Item[];
  readonly purged: readonly Tombstone[];
  readonly next: SyncCursor;
};
