import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import {
  DELIVERY_FAILURE,
  destinationDetail,
  templateDetail,
} from "./routing/delivery";
import { landingFor, type Landed } from "./routing/output";
import { established } from "./templates/establish";
import { releaseTriggerTag } from "./templates/fire";
import { later } from "#utils/time";
import { ok, refused } from "#utils/result";
import type { PoolConfig } from "#types/api/config";
import type { PoolPorts, PoolTx } from "#types/api/ports";
import type { CompletionRefusal, LeaseRefusal } from "#types/api/refusal";
import type { FailureDetail } from "#types/domain/enrichment";
import type {
  Duration,
  LeaseId,
  RoutingRecordId,
  Timestamp,
} from "#types/domain/ids";
import type { AbandonedPosition } from "#types/domain/position";
import type {
  AbandonedWork,
  ClaimRequest,
  Job,
  JobKind,
  Lease,
  RetryPolicy,
  WorkOutcome,
} from "#types/domain/work";
import type { Page, Result, Slice } from "#types/result";
import type { JsonObject } from "#types/json";

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
  const claimed: Lease[] = [];
  const vanished: Lease[] = [];

  // Ending a vanished delivery must not cost the caller a slot it asked for,
  // so what was dropped is claimed again. The rows just ended hold this
  // claim's own lease and are not offered twice, which is what stops the loop.
  while (claimed.length < request.limit) {
    const leases = await ports.work.claim(
      { ...request, limit: request.limit - claimed.length },
      ports.clock.now(),
    );
    if (leases.length === 0) break;

    for (const lease of leases) {
      const ended = lease.reclaimed === true && lease.job.kind === "delivery";
      (ended ? vanished : claimed).push(lease);
    }
  }

  try {
    for (const lease of vanished) await abandonUnknown(ports, lease);
  } catch (cause) {
    // Nothing is handed out that the caller will not hear about again.
    for (const lease of claimed) await ports.work.releaseLease(lease.id);
    throw cause;
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
): Promise<Result<void, CompletionRefusal>> {
  if (outcome.kind === "enriched") {
    throw new Error("core: recording enrichment output is not implemented yet");
  }

  // Outside the transaction, for the reason `route` stores one outside its own.
  const landed =
    outcome.kind === "delivered" ? await landingFor(ports, outcome) : undefined;

  return ports.store.transaction(async (tx) => {
    const held = await tx.leasedJob(lease);
    if (held === undefined) return refused({ kind: "lease-lost", lease });

    const delivery = held.job.subject.kind === "routing-record";
    if (outcome.kind === "delivered" && !delivery) {
      return refused<void, CompletionRefusal>({
        kind: "wrong-outcome",
        lease,
        work: held.job.kind,
      });
    }

    if (outcome.kind === "succeeded" || outcome.kind === "delivered") {
      if (held.job.subject.kind === "routing-record") {
        await land(ports, tx, held.job.subject.record, landed);
      }

      await tx.resolveJob(lease, { kind: "done" });
      return ok<void, CompletionRefusal>(undefined);
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

    return ok<void, CompletionRefusal>(undefined);
  });
}

/** The mirror is owed the write it was not owed while nothing had arrived. */
async function land(
  ports: PoolPorts,
  tx: PoolTx,
  id: RoutingRecordId,
  landed: Landed | undefined,
): Promise<void> {
  const record = await tx.routingRecord(id);
  // Cancelled from under the attempt, and whoever removed it left the entry saying so.
  if (record === undefined) return;

  const landing = landed?.landing ?? {};
  const at = ports.clock.now();
  await tx.resolveRoutingRecord(id, landing);
  await established(ports, tx, record, at);
  await enqueueMirrorWrite(ports, tx, { kind: "item", item: record.item }, at);
  await recordAction(ports, tx, {
    kind: "routed",
    subject: record.item,
    by: { kind: "person" },
    at,
    detail: {
      record: id,
      target: record.target.kind,
      ...destinationDetail(record),
      ...templateDetail(record),
      ...(landing.pointer === undefined ? {} : { pointer: landing.pointer }),
      ...(landed?.outputLost === undefined
        ? {}
        : { outputLost: landed.outputLost }),
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
  // Read before the removal below: the log's subject is an item, always.
  const record =
    subject.kind === "routing-record"
      ? await tx.routingRecord(subject.record)
      : undefined;
  const item = subject.kind === "item" ? subject.item : record?.item;

  if (ended.giveUp && subject.kind === "routing-record") {
    await tx.removeRoutingRecord(subject.record);
    // Nothing landed, so a tag that filed it there says something untrue — and
    // one left on the item could never file it again.
    if (record !== undefined) {
      await releaseTriggerTag(ports, tx, record, ended.at, "notemap");
    }
  }

  // One sequence of attempts reads as one kind of entry, whether the attempt
  // was the inline one or a job's. The end of the road adds `work-abandoned`
  // beside it, which is what every kind of work lands on.
  if (record !== undefined) {
    await recordAction(ports, tx, {
      kind: "delivery-failed",
      subject: record.item,
      by: { kind: "notemap" },
      at: ended.at,
      detail: {
        record: record.id,
        ...destinationDetail(record),
        attempt: ended.attempt,
        failure: ended.failure,
      },
    });
  } else if (!ended.giveUp) {
    await recordAction(ports, tx, {
      kind: "work-failed",
      ...(item === undefined ? {} : { subject: item }),
      // Nobody asked for this attempt, so nobody but notemap made it.
      by: { kind: "notemap" },
      at: ended.at,
      detail: workDetail(job, ended),
    });
  }

  if (!ended.giveUp) return;

  await recordAction(ports, tx, {
    kind: "work-abandoned",
    ...(item === undefined ? {} : { subject: item }),
    by: { kind: "notemap" },
    at: ended.at,
    detail: workDetail(job, ended),
  });
}

function workDetail(
  job: Job,
  ended: { attempt: number; failure: FailureDetail },
): JsonObject {
  const subject = job.subject;
  return {
    work: job.kind,
    attempt: ended.attempt,
    failure: ended.failure,
    ...(job.enrichment === undefined ? {} : { enrichment: job.enrichment }),
    ...(subject.kind === "routing-record" ? { record: subject.record } : {}),
  };
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
