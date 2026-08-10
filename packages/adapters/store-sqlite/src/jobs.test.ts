import type {
  Duration,
  ItemId,
  ItemRecord,
  Job,
  JobId,
  LeaseId,
  PoolStore,
  Timestamp,
} from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  appendCapture,
  at,
  capture,
  countingIds,
  mirrorJob,
  store,
} from "./testing/fixture";

const MINUTE = 60_000 as Duration;

const NOW = at("2026-08-03T10:00:00.000Z");

const open: (() => Promise<void>)[] = [];

function pool(...args: Parameters<typeof store>) {
  const opened = store(...args);
  open.push(opened.cleanup);
  return opened;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((cleanup) => cleanup()));
});

function job(overrides: {
  id: string;
  subject: ItemRecord | string;
  kind?: Job["kind"];
  enqueuedAt?: string;
}): Job {
  const subject =
    typeof overrides.subject === "string"
      ? (overrides.subject as ItemId)
      : overrides.subject.id;

  return {
    id: overrides.id as JobId,
    kind: overrides.kind ?? "mirror",
    subject,
    attempt: 0,
    enqueuedAt: at(overrides.enqueuedAt ?? "2026-08-03T09:00:00.000Z"),
  };
}

function enqueue(p: PoolStore, ...jobs: readonly Job[]): Promise<void> {
  return p.transaction((tx) => tx.enqueue(jobs));
}

function claim(
  p: PoolStore,
  overrides: { limit?: number; kinds?: Job["kind"][]; now?: Timestamp } = {},
) {
  return p.claim(
    {
      kinds: overrides.kinds ?? ["mirror"],
      limit: overrides.limit ?? 10,
      leaseFor: MINUTE,
    },
    overrides.now ?? NOW,
  );
}

function jobIds(raw: { prepare: (sql: string) => { all: () => unknown[] } }) {
  return (
    raw.prepare("SELECT id FROM jobs ORDER BY id").all() as { id: string }[]
  ).map((row) => row.id);
}

describe("coalescing", () => {
  it("collapses repeated enqueues for one item into a single job", async () => {
    const { pool: p, raw } = pool();
    const record = capture();
    await appendCapture(p, record);

    for (let n = 1; n <= 5; n += 1) {
      await enqueue(p, job({ id: `job-${n}`, subject: record }));
    }

    expect(jobIds(raw)).toEqual(["job-1"]);
  });

  it("keeps mirror and mirror-remove for one item apart", async () => {
    const { pool: p, raw } = pool();
    const record = capture();
    await appendCapture(p, record);

    await enqueue(
      p,
      job({ id: "write", subject: record }),
      job({ id: "remove", subject: record, kind: "mirror-remove" }),
    );

    expect(jobIds(raw)).toEqual(["remove", "write"]);
  });

  it("does not coalesce across items", async () => {
    const { pool: p, raw } = pool();
    const first = capture({ id: "item-1" });
    const second = capture({ id: "item-2" });
    await appendCapture(p, first);
    await appendCapture(p, second);

    await enqueue(
      p,
      job({ id: "job-1", subject: first }),
      job({ id: "job-2", subject: second }),
    );

    expect(jobIds(raw)).toEqual(["job-1", "job-2"]);
  });

  /**
   * The race the whole rule exists for: the host holding the lease has already
   * read the state it is writing, so absorbing this mutation into it would lose
   * the mutation with nothing recording the loss.
   */
  it("enqueues a second job for a mutation arriving during a lease", async () => {
    const { pool: p, raw } = pool();
    const record = capture();
    await appendCapture(p, record);
    await enqueue(p, job({ id: "first", subject: record }));

    const [lease] = await claim(p);
    expect(lease).toBeDefined();

    await enqueue(p, job({ id: "second", subject: record }));

    expect(jobIds(raw)).toEqual(["first", "second"]);
  });

  it("still refuses two jobs sharing an id", async () => {
    const { pool: p } = pool();
    const record = capture();
    await appendCapture(p, record);
    await enqueue(p, job({ id: "job-1", subject: record }));

    await expect(
      enqueue(p, job({ id: "job-1", subject: "item-other" })),
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });
});

describe("claiming", () => {
  it("hands out the oldest job first", async () => {
    const { pool: p } = pool({ ids: countingIds() });
    for (const [index, id] of ["c", "a", "b"].entries()) {
      await appendCapture(p, capture({ id: `item-${id}` }));
      await enqueue(
        p,
        job({
          id: `job-${id}`,
          subject: `item-${id}`,
          enqueuedAt: `2026-08-03T09:0${2 - index}:00.000Z`,
        }),
      );
    }

    const leases = await claim(p);

    expect(leases.map((lease) => lease.job.id)).toEqual([
      "job-b",
      "job-a",
      "job-c",
    ]);
    expect(leases.map((lease) => lease.id)).toEqual([
      "lease-1",
      "lease-2",
      "lease-3",
    ]);
  });

  it("leases only the kinds it was asked for", async () => {
    const { pool: p } = pool();
    const record = capture();
    await appendCapture(p, record);
    await enqueue(
      p,
      job({ id: "write", subject: record }),
      job({ id: "remove", subject: record, kind: "mirror-remove" }),
    );

    const leases = await claim(p, { kinds: ["mirror-remove"] });

    expect(leases.map((lease) => lease.job.id)).toEqual(["remove"]);
  });

  /**
   * Both jobs are claimable on their own; leasing either is what makes the
   * other unclaimable, so at most one write per item is ever in flight.
   */
  it("leases one of an item's two mirror jobs, never both", async () => {
    const { pool: p } = pool();
    const record = capture();
    await appendCapture(p, record);
    await enqueue(p, job({ id: "first", subject: record }));
    await claim(p);
    await enqueue(p, job({ id: "second", subject: record }));

    const second = await claim(p);

    expect(second).toEqual([]);
  });

  it("gives one lease when two claims race for one item's work", async () => {
    const { pool: p } = pool();
    const record = capture();
    await appendCapture(p, record);
    await enqueue(p, job({ id: "job-1", subject: record }));

    const [left, right] = await Promise.all([claim(p), claim(p)]);

    expect([...left, ...right]).toHaveLength(1);
  });

  it("reclaims an expired lease without anything having reaped it", async () => {
    const { pool: p } = pool({ ids: countingIds() });
    const record = capture();
    await appendCapture(p, record);
    await enqueue(p, job({ id: "job-1", subject: record }));

    const [first] = await claim(p);
    const later = at("2026-08-03T10:02:00.000Z");
    const [second] = await claim(p, { now: later });

    expect(first?.id).toBe("lease-1");
    expect(second?.id).toBe("lease-2");
    expect(second?.job.id).toBe("job-1");
  });

  it("leaves a lease alone until it expires", async () => {
    const { pool: p } = pool();
    const record = capture();
    await appendCapture(p, record);
    await enqueue(p, job({ id: "job-1", subject: record }));

    await claim(p);
    const again = await claim(p, { now: at("2026-08-03T10:00:59.999Z") });

    expect(again).toEqual([]);
  });

  it("hands out no more than the limit", async () => {
    const { pool: p } = pool();
    for (const id of ["a", "b", "c"]) {
      await appendCapture(p, capture({ id: `item-${id}` }));
      await enqueue(p, job({ id: `job-${id}`, subject: `item-${id}` }));
    }

    expect(await claim(p, { limit: 2 })).toHaveLength(2);
  });

  it("refuses a limit or a lease that is not a positive whole number", async () => {
    const { pool: p } = pool();

    await expect(claim(p, { limit: 0 })).rejects.toThrow(/positive integer/);
    await expect(
      p.claim({ kinds: ["mirror"], limit: 1, leaseFor: 0 as Duration }, NOW),
    ).rejects.toThrow(/positive whole number/);
  });
});

describe("leases", () => {
  async function leased() {
    const opened = pool({ ids: countingIds() });
    const record = capture();
    await appendCapture(opened.pool, record);
    await enqueue(opened.pool, job({ id: "job-1", subject: record }));
    const [lease] = await claim(opened.pool);
    if (lease === undefined) throw new Error("expected a lease");
    return { ...opened, record, lease };
  }

  it("extends the one it holds", async () => {
    const { pool: p, lease, raw } = await leased();
    const until = at("2026-08-03T10:05:00.000Z");

    const extended = await p.extendLease(lease.id, until);

    expect(extended).toEqual({
      kind: "ok",
      value: { ...lease, expiresAt: until },
    });
    expect(
      raw.prepare("SELECT lease_expires_at FROM jobs").get(),
    ).toMatchObject({ lease_expires_at: Date.parse(until) });
  });

  it("refuses to extend a lease that has been taken over", async () => {
    const { pool: p, lease } = await leased();
    await claim(p, { now: at("2026-08-03T10:02:00.000Z") });

    expect(await p.extendLease(lease.id, NOW)).toEqual({
      kind: "refused",
      refusal: { kind: "lease-lost", lease: lease.id },
    });
  });

  it("refuses to release a lease it never issued", async () => {
    const { pool: p } = pool();

    expect(await p.releaseLease("nobody's" as LeaseId)).toEqual({
      kind: "refused",
      refusal: { kind: "lease-lost", lease: "nobody's" },
    });
  });

  it("puts a released job back where anyone can claim it", async () => {
    const { pool: p, lease } = await leased();

    expect(await p.releaseLease(lease.id)).toEqual({
      kind: "ok",
      value: undefined,
    });
    expect((await claim(p)).map((next) => next.job.id)).toEqual(["job-1"]);
  });

  /**
   * Releasing it unchanged would leave the item with two unleased mirror jobs,
   * which coalescing forbids. The newer one writes state read fresh, so it says
   * everything this one would have.
   */
  it("drops a released job the newer one supersedes", async () => {
    const { pool: p, record, raw } = await leased();
    await enqueue(p, job({ id: "job-2", subject: record }));
    const stale = raw
      .prepare("SELECT lease_id FROM jobs WHERE id = 'job-1'")
      .get() as { lease_id: string };

    await p.releaseLease(stale.lease_id as LeaseId);

    expect(jobIds(raw)).toEqual(["job-2"]);
  });
});

describe("backoff and abandonment", () => {
  async function withJobRow(
    columns: Record<string, number | string | null>,
  ): Promise<PoolStore> {
    const { pool: p, raw } = pool();
    const record = capture();
    await appendCapture(p, record, [mirrorJob(record, "job-1")]);

    const assignments = Object.keys(columns)
      .map((column) => `${column} = ?`)
      .join(", ");
    raw
      .prepare(`UPDATE jobs SET ${assignments} WHERE id = 'job-1'`)
      .run(...Object.values(columns));

    return p;
  }

  it("hides a job until its next attempt is due", async () => {
    const p = await withJobRow({
      next_attempt_at: Date.parse("2026-08-03T10:30:00.000Z"),
    });

    expect(await claim(p)).toEqual([]);
    expect(
      (await claim(p, { now: at("2026-08-03T10:30:00.000Z") })).map(
        (lease) => lease.job.id,
      ),
    ).toEqual(["job-1"]);
  });

  it("never hands out abandoned work", async () => {
    const p = await withJobRow({
      abandoned_at: Date.parse("2026-08-03T09:30:00.000Z"),
      last_failure_code: "renderer-threw",
      last_failure_detail: "no",
    });

    expect(await claim(p)).toEqual([]);
  });
});
