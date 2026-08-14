import { recordAction } from "./actions";
import { ok, refused } from "../utils/result";
import type { PoolConfig } from "../types/api/config";
import type { PoolPorts } from "../types/api/ports";
import type { LeaseRefusal } from "../types/api/refusal";
import type { Duration, LeaseId, Timestamp } from "../types/domain/ids";
import type { AbandonedPosition } from "../types/domain/position";
import type {
  AbandonedWork,
  ClaimRequest,
  JobKind,
  Lease,
  RetryPolicy,
  WorkOutcome,
} from "../types/domain/work";
import type { Page, Result, Slice } from "../types/result";

/** Mirror attempts have no ceiling, so the doubling needs one before it reaches Infinity. */
const MAX_DOUBLINGS = 32;

export function claim(
  ports: PoolPorts,
  request: ClaimRequest,
): Promise<readonly Lease[]> {
  return ports.work.claim(request, ports.clock.now());
}

export function extend(
  ports: PoolPorts,
  lease: LeaseId,
  by: Duration,
): Promise<Result<Lease, LeaseRefusal>> {
  return ports.work.extendLease(lease, later(ports.clock.now(), by));
}

export function release(
  ports: PoolPorts,
  lease: LeaseId,
): Promise<Result<void, LeaseRefusal>> {
  return ports.work.releaseLease(lease);
}

export function abandoned(
  ports: PoolPorts,
  page: Page<AbandonedPosition>,
): Promise<Slice<AbandonedWork, AbandonedPosition>> {
  return ports.work.abandonedWork(page);
}

export async function complete(
  config: PoolConfig,
  ports: PoolPorts,
  lease: LeaseId,
  outcome: WorkOutcome,
): Promise<Result<void, LeaseRefusal>> {
  if (outcome.kind === "enriched") {
    throw new Error("core: recording enrichment output is not implemented yet");
  }

  return ports.store.transaction(async (tx) => {
    const held = await tx.leasedJob(lease);
    if (held === undefined) return refused({ kind: "lease-lost", lease });

    if (outcome.kind === "succeeded" || outcome.kind === "delivered") {
      await tx.resolveJob(lease, { kind: "done" });
      return ok<void, LeaseRefusal>(undefined);
    }

    const attempt = held.job.attempt + 1;
    const at = ports.clock.now();
    const giveUp =
      !outcome.retryable || exhausted(config.retry, held.job.kind, attempt);

    await tx.resolveJob(
      lease,
      giveUp
        ? {
            kind: "abandoned",
            attempt,
            abandonedAt: at,
            failure: outcome.detail,
          }
        : {
            kind: "retry",
            attempt,
            nextAttemptAt: later(at, backoff(config.retry, attempt)),
            failure: outcome.detail,
          },
    );

    await recordAction(ports, tx, {
      kind: giveUp ? "work-abandoned" : "work-failed",
      ...(held.job.subject.kind === "item"
        ? { subject: held.job.subject.item }
        : {}),
      // Nobody asked for this attempt, so nobody but notemap made it.
      by: { kind: "notemap" },
      at,
      detail: {
        work: held.job.kind,
        attempt,
        failure: outcome.detail,
        ...(held.job.enrichment === undefined
          ? {}
          : { enrichment: held.job.enrichment }),
      },
    });

    return ok<void, LeaseRefusal>(undefined);
  });
}

/** Only enrichment is bounded: unmirrored material is owed however many times the write has failed. */
function exhausted(
  policy: RetryPolicy,
  kind: JobKind,
  attempt: number,
): boolean {
  return kind === "enrichment" && attempt >= policy.maxAttempts;
}

function backoff(policy: RetryPolicy, attempt: number): Duration {
  const doublings = Math.min(attempt - 1, MAX_DOUBLINGS);
  return Math.min(
    policy.initialBackoff * 2 ** doublings,
    policy.maxBackoff,
  ) as Duration;
}

function later(at: Timestamp, by: Duration): Timestamp {
  return new Date(Date.parse(at) + by).toISOString() as Timestamp;
}
