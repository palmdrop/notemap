import type { EnrichmentName, Timestamp } from "./ids";
import type { JobKind, JobSubject } from "./work";

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
  readonly subject: JobSubject;
  readonly kind: JobKind;
  /** Present for enrichment work only. */
  readonly enrichment?: EnrichmentName;
};
