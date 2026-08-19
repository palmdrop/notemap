import type { ArtifactDraft, FailureDetail } from "./enrichment";
import type {
  Duration,
  EnrichmentName,
  ItemId,
  JobId,
  LeaseId,
  RoutingRecordId,
  Timestamp,
} from "./ids";
import type { MirrorSubject } from "./mirror";
import type { SuggestionDraft } from "./suggestion";

export type JobKind = "enrichment" | "mirror" | "mirror-remove" | "delivery";

/**
 * Two pending deliveries of one item are two jobs, so a delivery names the
 * record it carries out rather than the item that record is about.
 */
export type JobSubject =
  | MirrorSubject
  | { readonly kind: "routing-record"; readonly record: RoutingRecordId };

/** Deliberately partial: what a job carries as input is unsettled. */
export type Job = {
  readonly id: JobId;
  readonly kind: JobKind;
  /** Need not still exist: a purge's mirror-remove outlives the item it names. */
  readonly subject: JobSubject;
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
  /**
   * Present when this claim took over a lease that expired with nothing
   * reported. What the previous holder did is unknown, which for work that
   * cannot be repeated safely is not the same as knowing it did nothing.
   */
  readonly reclaimed?: true;
};

export type WorkOutcome =
  | { readonly kind: "succeeded" }
  | { readonly kind: "delivered"; readonly pointer?: string }
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

/** `maxAttempts` does not bound mirror work: a retryable mirror failure retries forever. */
export type RetryPolicy = {
  readonly maxAttempts: number;
  readonly initialBackoff: Duration;
  readonly maxBackoff: Duration;
};

/** Held is not a failure: an attempt may be underway, and its outcome is not the caller's to decide. */
export type WorkWithdrawal = "withdrawn" | "held";

/** What core decided a finished attempt means. The store applies it and holds no policy of its own. */
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
  readonly subject: JobSubject;
  /**
   * Outlives the subject: an abandoned delivery's record is removed, and this
   * row still names a capture. Absent for work about no item at all, which a
   * destination's mirror write is.
   */
  readonly item?: ItemId;
  readonly kind: JobKind;
  /** Present for enrichment work only. */
  readonly enrichment?: EnrichmentName;
  readonly attempts: number;
  readonly lastFailure: FailureDetail;
  readonly abandonedAt: Timestamp;
};
