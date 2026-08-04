import type { ItemId, Timestamp } from "./ids.js";
import type { Item } from "./item.js";

declare const brand: unique symbol;

export type SyncCursor = string & { readonly [brand]: "SyncCursor" };

export type Tombstone = {
  readonly item: ItemId;
  readonly purgedAt: Timestamp;
};

export type Delta = {
  readonly changed: readonly Item[];
  readonly purged: readonly Tombstone[];
  readonly next: SyncCursor;
};
