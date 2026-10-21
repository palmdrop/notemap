import type { Branded } from "../branded";
import type { DestinationId, SourceId, TagName } from "./ids";

/**
 * The tags a surface is read through, every one of which an item must carry.
 * Branded because only `tagFilter` makes one, so a store is never handed a
 * name that was not trimmed, or the same name twice.
 */
export type TagFilter = Branded<readonly TagName[], "TagFilter">;

/** What became of an item, as a feed filter asks it. */
export const ITEM_STATES = [
  "unprocessed",
  "routed",
  "archived",
  "revised",
] as const;

export type ItemState = (typeof ITEM_STATES)[number];

/**
 * What the queue and the archive may be read through. Every tag must be
 * carried; any one source is enough.
 */
export type SurfaceFilter = {
  readonly tags?: TagFilter;
  readonly sources?: readonly SourceId[];
};

/**
 * The feed's filter. Within states, destinations and sources any one is
 * enough; every kind named holds at once.
 */
export type FeedFilter = SurfaceFilter & {
  readonly states?: readonly ItemState[];
  readonly destinations?: readonly DestinationId[];
};
