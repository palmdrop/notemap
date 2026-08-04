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

export type JobKind = "enrichment" | "mirror";

/** Deliberately partial: what a job carries as input is unsettled. */
export type Job = {
  readonly id: JobId;
  readonly kind: JobKind;
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

export type WorkOutcome =
  | {
      readonly kind: "succeeded";
      readonly artifacts: readonly ArtifactDraft[];
      readonly suggestions: readonly SuggestionDraft[];
    }
  | {
      readonly kind: "failed";
      readonly retryable: boolean;
      readonly detail: FailureDetail;
    };

export type RetryPolicy = {
  readonly maxAttempts: number;
  readonly initialBackoff: Duration;
  readonly maxBackoff: Duration;
};
