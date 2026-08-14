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

export type JobSubject = { readonly kind: "item"; readonly item: ItemId };

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
};

/** Two successes rather than one, because only enrichment produces material. */
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

/** `maxAttempts` bounds enrichment only: a retryable mirror failure retries forever. */
export type RetryPolicy = {
  readonly maxAttempts: number;
  readonly initialBackoff: Duration;
  readonly maxBackoff: Duration;
};

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
  readonly item: ItemId;
  readonly kind: JobKind;
  /** Present for enrichment work only. */
  readonly enrichment?: EnrichmentName;
  readonly attempts: number;
  readonly lastFailure: FailureDetail;
  readonly abandonedAt: Timestamp;
};
