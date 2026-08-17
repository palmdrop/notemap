import {
  ok,
  refused,
  type AbandonedPosition,
  type AbandonedWork,
  type ClaimRequest,
  type EnrichmentName,
  type IdGenerator,
  type ItemId,
  type Job,
  type JobResolution,
  type JobSubject,
  type Lease,
  type LeaseId,
  type LeaseRefusal,
  type Page,
  type Result,
  type Slice,
  type Timestamp,
  type WorkWithdrawal,
} from "@notemap/core";

import {
  subjectColumns,
  toJob,
  toJobSubject,
  toMillis,
  toTimestamp,
} from "./mapping";
import type { JobRow } from "./rows";
import type { Bindable, statements } from "./statements";

type Statements = ReturnType<typeof statements>;

const JOB_COLUMNS = `
  id, kind, subject_kind, subject_id, subject_item, enrichment, attempt,
  enqueued_at, next_attempt_at, lease_id, lease_expires_at, abandoned_at,
  last_failure_code, last_failure_detail
`;

/** The kinds the one-write-per-item rules apply to. */
const MIRROR_KINDS = `('mirror', 'mirror-remove')`;

function mirrors(kind: JobRow["kind"]): boolean {
  return kind === "mirror" || kind === "mirror-remove";
}

/**
 * Matched against the partial index of the same name, so only it can be
 * conflicted on. Abandoned rows are excluded: they are not pending, and holding
 * a slot would make an abandoned job swallow every later write its item owes.
 */
const PENDING_MIRROR = `kind IN ${MIRROR_KINDS} AND lease_id IS NULL AND abandoned_at IS NULL`;

/**
 * The queue, as SQL. Synchronous, because `node:sqlite` is: every method here
 * runs to completion inside whichever transaction the caller opened, and none
 * of them may await.
 */
export type JobQueue = {
  enqueue(jobs: readonly Job[]): void;
  claim(request: ClaimRequest, now: Timestamp): readonly Lease[];
  extendLease(lease: LeaseId, until: Timestamp): Result<Lease, LeaseRefusal>;
  releaseLease(lease: LeaseId): Result<void, LeaseRefusal>;
  leasedJob(lease: LeaseId): Lease | undefined;
  resolveJob(lease: LeaseId, resolution: JobResolution): void;
  withdrawWork(subject: JobSubject): WorkWithdrawal;
};

export function jobQueue(write: Statements, ids: IdGenerator): JobQueue {
  const insert = write.query(`
    INSERT INTO jobs
      (id, kind, subject_kind, subject_id, subject_item, enrichment, attempt,
       enqueued_at, next_attempt_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (subject_kind, subject_id, kind) WHERE ${PENDING_MIRROR}
      DO NOTHING
  `);

  /** A delivery job outlives the reservation it names, so the link cannot be a join at read time. */
  const itemOfRecord = write.query<{ item_id: string }, [string]>(
    `SELECT item_id FROM routing_records WHERE id = ?`,
  );

  function subjectItem(subject: JobSubject): string {
    if (subject.kind === "item") return subject.item;

    const row = itemOfRecord.get(subject.record);
    if (row === undefined) {
      throw new Error(`no routing record ${subject.record} for work about one`);
    }
    return row.item_id;
  }

  const outstanding = write.query<
    { id: string; lease_id: string | null },
    [string, string]
  >(`SELECT id, lease_id FROM jobs WHERE subject_kind = ? AND subject_id = ?`);

  const byLease = write.query<JobRow, [string]>(
    `SELECT ${JOB_COLUMNS} FROM jobs WHERE lease_id = ?`,
  );

  const takeLease = write.query<never, [string, number, string]>(
    `UPDATE jobs SET lease_id = ?, lease_expires_at = ? WHERE id = ?`,
  );

  const setExpiry = write.query<never, [number, string]>(
    `UPDATE jobs SET lease_expires_at = ? WHERE lease_id = ?`,
  );

  const clearLease = write.query<never, [string]>(
    `UPDATE jobs SET lease_id = NULL, lease_expires_at = NULL WHERE id = ?`,
  );

  const deleteJob = write.query<never, [string]>(
    `DELETE FROM jobs WHERE id = ?`,
  );

  const finishJob = write.query<never, [string]>(
    `DELETE FROM jobs WHERE lease_id = ?`,
  );

  /**
   * The other pending mirror job for this item, whose existence forbids putting
   * this one back. It writes state read fresh, so it already says everything
   * this job would have.
   */
  const rival = write.query<{ id: string }, [string, string, string, string]>(`
    SELECT id FROM jobs
    WHERE subject_kind = ? AND subject_id = ? AND kind = ? AND id <> ?
      AND lease_id IS NULL AND abandoned_at IS NULL
    LIMIT 1
  `);

  /** An abandoned job's debt is settled once a later write for its item succeeds. */
  const clearAbandoned = write.query<never, [string, string, string]>(`
    DELETE FROM jobs
    WHERE subject_kind = ? AND subject_id = ? AND kind = ?
      AND abandoned_at IS NOT NULL
  `);

  /**
   * One claimable job, oldest first — for mirror work, only where the item has
   * no write already in flight.
   *
   * Taken one at a time rather than as a page: leasing the first is what makes
   * the second unclaimable, and a single query could not see its own effect.
   */
  function candidate(
    kinds: readonly string[],
    nowMs: number,
  ): JobRow | undefined {
    const slots = kinds.map(() => "?").join(", ");
    const params: Bindable[] = [...kinds, nowMs, nowMs, nowMs];

    return write
      .query<JobRow, Bindable[]>(
        `
        SELECT ${JOB_COLUMNS} FROM jobs AS job
        WHERE kind IN (${slots})
          AND abandoned_at IS NULL
          AND next_attempt_at <= ?
          AND (lease_id IS NULL OR lease_expires_at <= ?)
          AND (
            kind NOT IN ${MIRROR_KINDS}
            OR NOT EXISTS (
              SELECT 1 FROM jobs AS holder
              WHERE holder.subject_kind = job.subject_kind
                AND holder.subject_id = job.subject_id
                AND holder.kind IN ${MIRROR_KINDS}
                AND holder.id <> job.id
                AND holder.lease_id IS NOT NULL
                AND holder.lease_expires_at > ?
            )
          )
        ORDER BY enqueued_at ASC, id ASC
        LIMIT 1
      `,
      )
      .get(...params);
  }

  /** Whether a pending job for this item already says everything this one would. */
  function superseded(row: JobRow): boolean {
    return (
      mirrors(row.kind) &&
      rival.get(row.subject_kind, row.subject_id, row.kind, row.id) !==
        undefined
    );
  }

  return {
    enqueue: (jobs) => {
      for (const job of jobs) {
        const at = toMillis(job.enqueuedAt);
        insert.run(
          job.id,
          job.kind,
          ...subjectColumns(job.subject),
          subjectItem(job.subject),
          job.enrichment ?? null,
          job.attempt,
          at,
          at,
        );
      }
    },

    claim: (request, now) => {
      if (!Number.isInteger(request.limit) || request.limit <= 0) {
        throw new TypeError(
          `claim limit must be a positive integer: ${request.limit}`,
        );
      }
      if (!Number.isInteger(request.leaseFor) || request.leaseFor <= 0) {
        throw new TypeError(
          `a lease must last a positive whole number of milliseconds: ${request.leaseFor}`,
        );
      }
      if (request.kinds.length === 0) return [];

      const nowMs = toMillis(now);
      const expiresMs = nowMs + request.leaseFor;
      const expiresAt = toTimestamp(expiresMs);
      const leases: Lease[] = [];

      while (leases.length < request.limit) {
        const row = candidate(request.kinds, nowMs);
        if (row === undefined) break;

        const id = ids.next<LeaseId>();
        takeLease.run(id, expiresMs, row.id);
        leases.push({
          id,
          job: toJob(row),
          expiresAt,
          // Nothing reaps a lease, so one still on the row is the evidence
          // that its holder neither reported nor released.
          ...(row.lease_id === null ? {} : { reclaimed: true as const }),
        });
      }

      return leases;
    },

    /**
     * An expired lease nobody has reclaimed is still its holder's: a lease ends
     * by being taken from you, not by the clock passing.
     */
    extendLease: (lease, until) => {
      const row = byLease.get(lease);
      if (row === undefined) return refused({ kind: "lease-lost", lease });

      setExpiry.run(toMillis(until), lease);
      return ok({ id: lease, job: toJob(row), expiresAt: until });
    },

    releaseLease: (lease) => {
      const row = byLease.get(lease);
      if (row === undefined) return refused({ kind: "lease-lost", lease });

      if (superseded(row)) deleteJob.run(row.id);
      else clearLease.run(row.id);

      return ok<void, LeaseRefusal>(undefined);
    },

    leasedJob: (lease) => {
      const row = byLease.get(lease);
      if (row === undefined || row.lease_expires_at === null) return undefined;
      return {
        id: lease,
        job: toJob(row),
        expiresAt: toTimestamp(row.lease_expires_at),
      };
    },

    /** Applies what core decided, and gives up the lease in the same statement. */
    resolveJob: (lease, resolution) => {
      const row = byLease.get(lease);
      if (row === undefined) return;

      if (resolution.kind === "done") {
        finishJob.run(lease);
        if (mirrors(row.kind))
          clearAbandoned.run(row.subject_kind, row.subject_id, row.kind);
        return;
      }

      // A retry puts the job back among the pending, where a rival would
      // collide with it. Abandoning does not, so it never has to give way.
      if (resolution.kind === "retry" && superseded(row)) {
        deleteJob.run(row.id);
        return;
      }

      const [at, column] =
        resolution.kind === "retry"
          ? ([resolution.nextAttemptAt, "next_attempt_at"] as const)
          : ([resolution.abandonedAt, "abandoned_at"] as const);

      write
        .query<never, [number, string, string, number, string]>(
          `UPDATE jobs
           SET lease_id = NULL, lease_expires_at = NULL,
               attempt = ?, last_failure_code = ?, last_failure_detail = ?,
               ${column} = ?
           WHERE lease_id = ?`,
        )
        .run(
          resolution.attempt,
          resolution.failure.code,
          resolution.failure.detail,
          toMillis(at),
          lease,
        );
    },

    /**
     * An expired lease counts as held: its holder may be halfway through the
     * attempt nobody has heard about.
     */
    withdrawWork: (subject) => {
      const rows = outstanding.all(...subjectColumns(subject));
      if (rows.some((row) => row.lease_id !== null)) return "held";

      for (const row of rows) deleteJob.run(row.id);
      return "withdrawn";
    },
  };
}

/** Runs on the reader's connection, so it never sees what a transaction may still roll back. */
export function abandonedWork(
  source: Statements,
  page: Page<AbandonedPosition>,
): Slice<AbandonedWork, AbandonedPosition> {
  if (!Number.isInteger(page.limit) || page.limit <= 0) {
    throw new TypeError(`page limit must be a positive integer: ${page.limit}`);
  }

  const after = page.after;
  const where = after === undefined ? "" : `AND ${ABANDONED_KEYSET}`;
  const params: Bindable[] = [
    ...(after === undefined
      ? []
      : [
          toMillis(after.at),
          ...subjectColumns(after.subject),
          after.kind,
          after.enrichment ?? "",
        ]),
    // One more than asked for, so exhaustion is known rather than guessed.
    page.limit + 1,
  ];

  const rows = source
    .query<JobRow, Bindable[]>(
      `SELECT ${JOB_COLUMNS} FROM jobs
       WHERE abandoned_at IS NOT NULL ${where}
       ORDER BY ${ABANDONED_ORDER} LIMIT ?`,
    )
    .all(...params);

  const hasMore = rows.length > page.limit;
  const values = (hasMore ? rows.slice(0, page.limit) : rows).map(
    toAbandonedWork,
  );
  const last = values.at(-1);

  return {
    values,
    ...(hasMore && last
      ? {
          next: {
            at: last.abandonedAt,
            subject: last.subject,
            kind: last.kind,
            ...(last.enrichment === undefined
              ? {}
              : { enrichment: last.enrichment }),
          },
        }
      : {}),
  };
}

/**
 * The tuple identifying one abandoned row, compared whole. `enrichment` is null
 * for everything but enrichment work, and a null would make every comparison
 * against it null, so it collapses to the empty string on both sides.
 */
const ABANDONED_KEY = `(abandoned_at, subject_kind, subject_id, kind, COALESCE(enrichment, ''))`;
const ABANDONED_KEYSET = `${ABANDONED_KEY} > (?, ?, ?, ?, ?)`;
const ABANDONED_ORDER = `abandoned_at ASC, subject_kind ASC, subject_id ASC, kind ASC, COALESCE(enrichment, '') ASC`;

function toAbandonedWork(row: JobRow): AbandonedWork {
  if (row.abandoned_at === null || row.last_failure_code === null) {
    throw new Error(`job ${row.id} is abandoned with nothing saying why`);
  }

  return {
    subject: toJobSubject(row),
    item: row.subject_item as ItemId,
    kind: row.kind,
    ...(row.enrichment === null
      ? {}
      : { enrichment: row.enrichment as EnrichmentName }),
    attempts: row.attempt,
    lastFailure: {
      code: row.last_failure_code,
      detail: row.last_failure_detail ?? "",
    },
    abandonedAt: toTimestamp(row.abandoned_at),
  };
}
