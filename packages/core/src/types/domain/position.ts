import type { EnrichmentName, ItemId, Timestamp } from "./ids";
import type { JobKind } from "./work";

/**
 * Where a paginated read continues from: the sort key of the last row it handed
 * out, stated in the domain's own terms. A read parameter, never stored, and
 * not a record of where processing has got to.
 *
 * Order-free — it names a place rather than a direction of travel, so one
 * position continues a read either way. It is compared against, never looked
 * up, so it survives a purge of the row it names.
 */
export type Position = {
  readonly at: Timestamp;
  /**
   * Omitted for a coarse entry point, which bounds the read on `at` alone and
   * may therefore skip rows sharing that instant. Ids are arbitrary strings
   * with no extreme value to stand in for, so there is no way to make a bare
   * timestamp exact.
   */
  readonly id?: string;
};

/**
 * Abandoned work has no id of its own — it is identified by what it is about
 * and what kind of work it is — so the surface listing it is continued by
 * naming that tuple.
 */
export type AbandonedPosition = {
  readonly at: Timestamp;
  readonly item: ItemId;
  readonly kind: JobKind;
  /** Present for enrichment work only. */
  readonly enrichment?: EnrichmentName;
};
