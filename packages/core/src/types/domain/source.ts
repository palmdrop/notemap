import type { SourceId, Timestamp } from "./ids";

/**
 * A source the pool has seen, and how much of it. Discovered rather than
 * declared, so there is no such thing as a source that captured nothing: this
 * is derived from the items themselves.
 */
export type SourceUse = {
  readonly id: SourceId;
  readonly items: number;
  readonly lastCapturedAt: Timestamp;
};
