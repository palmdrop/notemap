import type { FailureDetail } from "./enrichment.js";
import type {
  Duration,
  EnrichmentName,
  ItemId,
  JobId,
  JsonObject,
  LeaseId,
  Timestamp,
} from "./ids.js";

export type JobKind = "enrichment" | "mirror";

/**
 * Deliberately partial. What a job carries as input, and how an enrichment's
 * declared needs resolve into one, is unsettled; only the fields every job
 * has regardless are named here.
 */
export type Job = {
  readonly id: JobId;
  readonly kind: JobKind;
  readonly subject: ItemId;
  readonly enrichment?: EnrichmentName;
  readonly attempt: number;
  readonly enqueuedAt: Timestamp;
};

export type ClaimRequest = {
  /** A host claims only what it can actually run. */
  readonly kinds: readonly JobKind[];
  readonly limit: number;
  readonly leaseFor: Duration;
};

/**
 * A lease expires by being past `expiresAt` when someone next claims — core
 * holds no timer, so nothing reaps it on a schedule.
 */
export type Lease = {
  readonly id: LeaseId;
  readonly job: Job;
  readonly expiresAt: Timestamp;
};

export type WorkOutcome =
  | { readonly kind: "succeeded"; readonly result: JsonObject }
  | {
      readonly kind: "failed";
      /** False sends it straight to abandoned: retrying will fail identically. */
      readonly retryable: boolean;
      readonly detail: FailureDetail;
    };

export type RetryPolicy = {
  readonly maxAttempts: number;
  readonly initialBackoff: Duration;
  readonly maxBackoff: Duration;
};
