import {
  ok,
  refused,
  type ClaimRequest,
  type IdGenerator,
  type Job,
  type Lease,
  type LeaseId,
  type LeaseRefusal,
  type Result,
  type Timestamp,
} from "@notemap/core";

import { toJob, toMillis, toTimestamp } from "./mapping";
import type { JobRow } from "./rows";
import type { Bindable, statements } from "./statements";

type Statements = ReturnType<typeof statements>;

const JOB_COLUMNS = `
  id, kind, subject, enrichment, attempt, enqueued_at, next_attempt_at,
  lease_id, lease_expires_at, abandoned_at, last_failure_code, last_failure_detail
`;

/** The kinds the one-write-per-item rules apply to. */
const MIRROR_KINDS = `('mirror', 'mirror-remove')`;

/** Matched against the partial index of the same name, so only it can be conflicted on. */
const UNLEASED_MIRROR = `kind IN ${MIRROR_KINDS} AND lease_id IS NULL`;

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
};

export function jobQueue(write: Statements, ids: IdGenerator): JobQueue {
  const insert = write.query(`
    INSERT INTO jobs
      (id, kind, subject, enrichment, attempt, enqueued_at, next_attempt_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (subject, kind) WHERE ${UNLEASED_MIRROR} DO NOTHING
  `);

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

  /**
   * Whether releasing this lease would leave the item with two unleased mirror
   * jobs, which the coalescing index forbids. The rival is the newer job, and
   * it writes state read fresh, so it says everything this one would have.
   */
  const rival = write.query<{ id: string }, [string, string, string]>(`
    SELECT id FROM jobs
    WHERE subject = ? AND kind = ? AND id <> ? AND lease_id IS NULL
    LIMIT 1
  `);

  /**
   * One claimable job, oldest first. Skips what is abandoned, what is waiting
   * out a backoff, and what someone else still holds — and, for mirror work,
   * anything whose item already has a write in flight, so two writers never
   * race on one file.
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
              WHERE holder.subject = job.subject
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

  return {
    enqueue: (jobs) => {
      for (const job of jobs) {
        const at = toMillis(job.enqueuedAt);
        insert.run(
          job.id,
          job.kind,
          job.subject,
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
        leases.push({ id, job: toJob(row), expiresAt });
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

      if (
        row.kind === "enrichment" ||
        rival.get(row.subject, row.kind, row.id) === undefined
      ) {
        clearLease.run(row.id);
      } else {
        deleteJob.run(row.id);
      }

      return ok<void, LeaseRefusal>(undefined);
    },
  };
}
