import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import { DELIVERY_FAILURE } from "./routing/delivery";
import { ok, refused } from "../utils/result";
import type { PoolConfig } from "../types/api/config";
import type { PoolPorts, PoolTx } from "../types/api/ports";
import type { LeaseRefusal } from "../types/api/refusal";
import type { FailureDetail } from "../types/domain/enrichment";
import type {
  Duration,
  ItemId,
  LeaseId,
  RoutingRecordId,
  Timestamp,
} from "../types/domain/ids";
import type { AbandonedPosition } from "../types/domain/position";
import type {
  AbandonedWork,
  ClaimRequest,
  Job,
  JobKind,
  JobSubject,
  Lease,
  RetryPolicy,
  WorkOutcome,
} from "../types/domain/work";
import type { Page, Result, Slice } from "../types/result";

/** Mirror attempts have no ceiling, so the doubling needs one before it reaches Infinity. */
const MAX_DOUBLINGS = 32;

/**
 * A lease that expired with nothing reported is no evidence: the previous holder
 * may have delivered before it died. Repeatable work retries on that; a delivery
 * cannot, because nothing downstream could tell the duplicate from a second
 * decision. So a claim that finds one ends it instead of handing it out.
 */
export async function claim(
  ports: PoolPorts,
  request: ClaimRequest,
): Promise<readonly Lease[]> {
  const leases = await ports.work.claim(request, ports.clock.now());
  const claimed: Lease[] = [];

  for (const lease of leases) {
    if (lease.reclaimed === true && lease.job.kind === "delivery") {
      await abandonUnknown(ports, lease);
      continue;
    }
    claimed.push(lease);
  }

  return claimed;
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
      if (held.job.subject.kind === "routing-record") {
        await land(
          ports,
          tx,
          held.job.subject.record,
          outcome.kind === "delivered" ? outcome.pointer : undefined,
        );
      }

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

    await concluded(ports, tx, held.job, {
      attempt,
      at,
      giveUp,
      failure: outcome.detail,
    });

    return ok<void, LeaseRefusal>(undefined);
  });
}

/** The mirror is owed the write it was not owed while nothing had arrived. */
async function land(
  ports: PoolPorts,
  tx: PoolTx,
  id: RoutingRecordId,
  pointer: string | undefined,
): Promise<void> {
  const record = await tx.routingRecord(id);
  // Cancelled from under the attempt, and whoever removed it left the entry saying so.
  if (record === undefined) return;

  const at = ports.clock.now();
  await tx.resolveRoutingRecord(id, pointer);
  await enqueueMirrorWrite(ports, tx, record.item, at);
  await recordAction(ports, tx, {
    kind: "routed",
    subject: record.item,
    by: { kind: "person" },
    at,
    detail: {
      record: id,
      target: record.target.kind,
      ...(record.target.kind === "destination"
        ? {
            destination: record.target.destination,
            capability: record.target.capability,
          }
        : {}),
      ...(pointer === undefined ? {} : { pointer }),
    },
  });
}

/**
 * Giving up on a delivery removes its reservation, which returns the item to the
 * queue: nothing arrived anywhere, and the decision is the person's again.
 */
async function concluded(
  ports: PoolPorts,
  tx: PoolTx,
  job: Job,
  ended: {
    attempt: number;
    at: Timestamp;
    giveUp: boolean;
    failure: FailureDetail;
  },
): Promise<void> {
  const subject = job.subject;
  const item = await itemOf(tx, subject);

  if (ended.giveUp && subject.kind === "routing-record") {
    await tx.removeRoutingRecord(subject.record);
  }

  await recordAction(ports, tx, {
    kind: ended.giveUp ? "work-abandoned" : "work-failed",
    ...(item === undefined ? {} : { subject: item }),
    // Nobody asked for this attempt, so nobody but notemap made it.
    by: { kind: "notemap" },
    at: ended.at,
    detail: {
      work: job.kind,
      attempt: ended.attempt,
      failure: ended.failure,
      ...(job.enrichment === undefined ? {} : { enrichment: job.enrichment }),
      ...(subject.kind === "routing-record" ? { record: subject.record } : {}),
    },
  });
}

/** Read before the record is removed: the log's subject is an item, always. */
async function itemOf(
  tx: PoolTx,
  subject: JobSubject,
): Promise<ItemId | undefined> {
  if (subject.kind === "item") return subject.item;
  return (await tx.routingRecord(subject.record))?.item;
}

async function abandonUnknown(ports: PoolPorts, lease: Lease): Promise<void> {
  await ports.store.transaction(async (tx) => {
    const held = await tx.leasedJob(lease.id);
    if (held === undefined) return;

    const at = ports.clock.now();
    const attempt = held.job.attempt + 1;
    const failure: FailureDetail = {
      code: DELIVERY_FAILURE.unknown,
      detail: "a lease expired with no outcome reported",
    };

    await tx.resolveJob(lease.id, {
      kind: "abandoned",
      attempt,
      abandonedAt: at,
      failure,
    });
    await concluded(ports, tx, held.job, {
      attempt,
      at,
      giveUp: true,
      failure,
    });
  });
}

/**
 * Only mirror work is unbounded: giving up would not change that material is
 * unmirrored, where giving up on a delivery hands the decision back.
 */
function exhausted(
  policy: RetryPolicy,
  kind: JobKind,
  attempt: number,
): boolean {
  return (
    kind !== "mirror" &&
    kind !== "mirror-remove" &&
    attempt >= policy.maxAttempts
  );
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
