import type { EnrichmentName, ItemId, Timestamp } from "./ids";
import type { JobKind } from "./work";

/**
 * Where a paginated read continues from. Compared against, never looked up, so
 * it survives a purge of the row it names.
 */
export type Position = {
  readonly at: Timestamp;
  /** Omitted bounds the read on `at` alone, and may skip rows sharing that instant. */
  readonly id?: string;
};

/** Abandoned work has no id of its own: it is identified by subject and kind. */
export type AbandonedPosition = {
  readonly at: Timestamp;
  readonly item: ItemId;
  readonly kind: JobKind;
  /** Present for enrichment work only. */
  readonly enrichment?: EnrichmentName;
};
