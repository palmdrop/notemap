import type { ArtifactDraft, FailureDetail } from "./enrichment";
import type {
  Duration,
  EnrichmentName,
  ItemId,
  JobId,
  LeaseId,
  Timestamp,
} from "./ids";
import type { SuggestionDraft } from "./suggestion";

export type JobKind = "enrichment" | "mirror" | "mirror-remove";

/** Deliberately partial: what a job carries as input is unsettled. */
export type Job = {
  readonly id: JobId;
  readonly kind: JobKind;
  /**
   * The item the work is about, which need not still exist: removing a purged
   * item's mirror files outlives the item it names. Compared, never resolved.
   */
  readonly subject: ItemId;
  readonly enrichment?: EnrichmentName;
  readonly attempt: number;
  readonly enqueuedAt: Timestamp;
};

export type ClaimRequest = {
  readonly kinds: readonly JobKind[];
  readonly limit: number;
  readonly leaseFor: Duration;
};

export type Lease = {
  readonly id: LeaseId;
  readonly job: Job;
  readonly expiresAt: Timestamp;
};

/**
 * Two successes rather than one, because only enrichment produces material.
 * Mirror work that succeeded has nothing to report, and saying so with two
 * empty arrays would make emptiness look like a result rather than the shape.
 */
export type WorkOutcome =
  | { readonly kind: "succeeded" }
  | {
      readonly kind: "enriched";
      readonly artifacts: readonly ArtifactDraft[];
      readonly suggestions: readonly SuggestionDraft[];
    }
  | {
      readonly kind: "failed";
      readonly retryable: boolean;
      readonly detail: FailureDetail;
    };

/**
 * `maxAttempts` bounds enrichment only. A retryable mirror failure retries
 * indefinitely at the backoff cap, since the material exists and is unmirrored
 * however many times the write has failed.
 */
export type RetryPolicy = {
  readonly maxAttempts: number;
  readonly initialBackoff: Duration;
  readonly maxBackoff: Duration;
};

/**
 * What core decided a finished attempt means, for a store to apply. The store
 * holds no policy: which failures retry, how long the backoff is and when work
 * is given up on are core's, and arrive here already worked out.
 */
export type JobResolution =
  | { readonly kind: "done" }
  | {
      readonly kind: "retry";
      readonly attempt: number;
      readonly nextAttemptAt: Timestamp;
      readonly failure: FailureDetail;
    }
  | {
      readonly kind: "abandoned";
      readonly attempt: number;
      readonly abandonedAt: Timestamp;
      readonly failure: FailureDetail;
    };

/** One row of the surface answering "what needs me", for work of any kind. */
export type AbandonedWork = {
  readonly item: ItemId;
  readonly kind: JobKind;
  /** Present for enrichment work only. */
  readonly enrichment?: EnrichmentName;
  readonly attempts: number;
  readonly lastFailure: FailureDetail;
  readonly abandonedAt: Timestamp;
};
