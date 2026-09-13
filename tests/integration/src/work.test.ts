import type {
  AbandonedPosition,
  Duration,
  FailureDetail,
  Item,
  ItemId,
  Lease,
  LeaseId,
  Page,
  WorkOutcome,
} from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { CONFIG, envelope, harness, at, type Harness } from "./fixture";

const ALL: Page<AbandonedPosition> = { limit: 50 };
const LEASE_FOR = 60_000 as Duration;

const START = "2026-08-06T09:00:00.000Z";

const OFFLINE: FailureDetail = {
  code: "mirror-root-unwritable",
  detail: "the folder is not there",
};

const THREW: FailureDetail = {
  code: "renderer-threw",
  detail: "Cannot read properties of undefined",
};

const failed = (retryable: boolean, detail: FailureDetail): WorkOutcome => ({
  kind: "failed",
  retryable,
  detail,
});

const open: Harness[] = [];

function pool(...args: Parameters<typeof harness>): Harness {
  const opened = harness(...args);
  open.push(opened);
  return opened;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

/** A pool holding one captured item, and so one mirror job owed. */
async function owing(): Promise<Harness & { item: Item }> {
  const opened = pool();
  const result = await opened.pool.capture(envelope());
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return { ...opened, item: result.value.item };
}

function claim(p: Harness["pool"]): Promise<readonly Lease[]> {
  return p.work.claim({ kinds: ["mirror"], limit: 10, leaseFor: LEASE_FOR });
}

async function claimOne(p: Harness["pool"]): Promise<Lease> {
  const [lease] = await claim(p);
  if (lease === undefined) throw new Error("expected a claimable job");
  return lease;
}

/** Moves the clock on by whole seconds from the start of the test. */
function secondsIn(seconds: number): string {
  return new Date(Date.parse(START) + seconds * 1000).toISOString();
}

describe("completing work", () => {
  it("takes a succeeded job off the queue for good", async () => {
    const { pool: p } = await owing();
    const lease = await claimOne(p);

    expect(await p.work.complete(lease.id, { kind: "succeeded" })).toEqual({
      kind: "ok",
      value: undefined,
    });
    expect(await claim(p)).toEqual([]);
  });

  it("refuses a completion under a lease someone else has taken", async () => {
    const { pool: p, clock } = await owing();
    const stale = await claimOne(p);

    clock.set(secondsIn(120));
    const fresh = await claimOne(p);

    expect(await p.work.complete(stale.id, { kind: "succeeded" })).toEqual({
      kind: "refused",
      refusal: { kind: "lease-lost", lease: stale.id },
    });
    expect(fresh.job.id).toBe(stale.job.id);
    expect(await claim(p)).toEqual([]);
  });

  it("refuses a completion under a lease that was never issued", async () => {
    const { pool: p } = await owing();

    expect(
      await p.work.complete("invented" as LeaseId, { kind: "succeeded" }),
    ).toEqual({
      kind: "refused",
      refusal: { kind: "lease-lost", lease: "invented" },
    });
  });
});

describe("a retryable failure", () => {
  it("comes back once its backoff has passed, having never been abandoned", async () => {
    const { pool: p, clock } = await owing();
    const lease = await claimOne(p);

    await p.work.complete(lease.id, failed(true, OFFLINE));

    expect(await claim(p)).toEqual([]);
    expect((await p.work.abandoned(ALL)).values).toEqual([]);

    clock.set(secondsIn(1));
    const again = await claimOne(p);

    expect(again.job.id).toBe(lease.job.id);
    expect(again.job.attempt).toBe(1);
  });

  it("backs off further each time, up to the cap", async () => {
    const { pool: p, clock } = await owing();
    // 1s, 2s, 4s, 8s, 16s, 32s, then capped at the configured 60s.
    const waits = [1, 2, 4, 8, 16, 32, 60, 60];
    let elapsed = 0;

    for (const wait of waits) {
      const lease = await claimOne(p);
      await p.work.complete(lease.id, failed(true, OFFLINE));

      clock.set(secondsIn(elapsed + wait - 1));
      expect(await claim(p), `still waiting after ${wait - 1}s`).toEqual([]);

      elapsed += wait;
      clock.set(secondsIn(elapsed));
    }

    expect((await claimOne(p)).job.attempt).toBe(waits.length);
  });

  /**
   * The difference that matters: for mirroring the answer to "is anything still
   * coming?" is always yes, so the bound enrichment lives under does not apply.
   */
  it("never gives up on mirror work, however many attempts it takes", async () => {
    const { pool: p, clock } = await owing();
    const attempts = CONFIG.retry.maxAttempts * 3;
    let elapsed = 0;

    for (let n = 0; n < attempts; n += 1) {
      const lease = await claimOne(p);
      await p.work.complete(lease.id, failed(true, OFFLINE));
      elapsed += 60;
      clock.set(secondsIn(elapsed));
    }

    expect((await claimOne(p)).job.attempt).toBe(attempts);
    expect((await p.work.abandoned(ALL)).values).toEqual([]);
  });
});

describe("a non-retryable failure", () => {
  it("is given up on at the first attempt", async () => {
    const { pool: p, clock, item } = await owing();
    const lease = await claimOne(p);

    await p.work.complete(lease.id, failed(false, THREW));

    clock.set(secondsIn(86_400));
    expect(await claim(p)).toEqual([]);
    expect((await p.work.abandoned(ALL)).values).toEqual([
      {
        subject: { kind: "item", item: item.id },
        item: item.id,
        kind: "mirror",
        attempts: 1,
        lastFailure: THREW,
        abandonedAt: at(START),
      },
    ]);
  });

  it("orders the surface by when the work was given up on", async () => {
    const { pool: p, clock } = await owing();
    const second = await p.capture(
      envelope({ sourceItemId: "src-2", capturedAt: secondsIn(1) }),
    );
    if (second.kind === "refused") throw new Error("expected a capture");

    for (const [index, lease] of (await claim(p)).entries()) {
      clock.set(secondsIn(10 + index));
      await p.work.complete(lease.id, failed(false, THREW));
    }

    const abandoned = await p.work.abandoned(ALL);

    expect(abandoned.values.map((row) => row.abandonedAt)).toEqual([
      at(secondsIn(10)),
      at(secondsIn(11)),
    ]);
    expect(abandoned.values.every((row) => row.kind === "mirror")).toBe(true);
  });

  it("pages the surface from the position it handed back", async () => {
    const { pool: p, clock } = await owing();
    for (let n = 2; n <= 3; n += 1) {
      await p.capture(
        envelope({ sourceItemId: `src-${n}`, capturedAt: secondsIn(n) }),
      );
    }

    for (const [index, lease] of (await claim(p)).entries()) {
      clock.set(secondsIn(10 + index));
      await p.work.complete(lease.id, failed(false, THREW));
    }

    const first = await p.work.abandoned({ limit: 2 });
    expect(first.values).toHaveLength(2);
    if (first.next === undefined) throw new Error("expected another page");

    const rest = await p.work.abandoned({ limit: 2, after: first.next });
    expect(rest.values).toHaveLength(1);
    expect(rest.next).toBeUndefined();

    const seen = [...first.values, ...rest.values].map((row) => row.item);
    expect(new Set(seen).size).toBe(3);
  });

  it("pages across work given up on in the same instant", async () => {
    const { pool: p, clock } = await owing();
    for (let n = 2; n <= 3; n += 1) {
      await p.capture(
        envelope({ sourceItemId: `src-${n}`, capturedAt: secondsIn(n) }),
      );
    }

    // One instant for all three, so the position cannot decide on time alone
    // and has to break the tie on the subject it carries.
    clock.set(secondsIn(10));
    for (const lease of await claim(p)) {
      await p.work.complete(lease.id, failed(false, THREW));
    }

    const first = await p.work.abandoned({ limit: 2 });
    expect(first.values).toHaveLength(2);
    if (first.next === undefined) throw new Error("expected another page");

    const rest = await p.work.abandoned({ limit: 2, after: first.next });
    expect(rest.values).toHaveLength(1);
    expect(rest.next).toBeUndefined();

    const seen = [...first.values, ...rest.values].map((row) => row.item);
    expect(new Set(seen).size).toBe(3);
  });
});

describe("the action log", () => {
  async function kindsFor(p: Harness["pool"], item: ItemId) {
    const logged = await p.actions.read({ item }, ALL);
    return logged.values.map((action) => ({
      kind: action.kind,
      by: action.by,
      detail: action.detail,
    }));
  }

  it("records an attempt that will be retried", async () => {
    const { pool: p, item } = await owing();
    const lease = await claimOne(p);

    await p.work.complete(lease.id, failed(true, OFFLINE));

    // Newest first, so the attempt precedes the capture that owed it.
    expect(await kindsFor(p, item.id)).toEqual([
      {
        kind: "work-failed",
        by: { kind: "notemap" },
        detail: { work: "mirror", attempt: 1, failure: { ...OFFLINE } },
      },
      expect.objectContaining({ kind: "captured" }),
    ]);
  });

  it("records nothing for an attempt that succeeded", async () => {
    const { pool: p, item } = await owing();
    const lease = await claimOne(p);

    await p.work.complete(lease.id, { kind: "succeeded" });

    // The write is its own record. An entry beside it would say a second time
    // what the mirror file already says.
    expect(await kindsFor(p, item.id)).toEqual([
      expect.objectContaining({ kind: "captured" }),
    ]);
  });

  it("records an attempt that was the last one", async () => {
    const { pool: p, item } = await owing();
    const lease = await claimOne(p);

    await p.work.complete(lease.id, failed(false, THREW));

    expect(await kindsFor(p, item.id)).toContainEqual({
      kind: "work-abandoned",
      by: { kind: "notemap" },
      detail: { work: "mirror", attempt: 1, failure: { ...THREW } },
    });
  });
});

/** The outcome that was dropped is the one the work was for, so it is refused rather than ignored. */
describe("an outcome the job cannot have produced", () => {
  it("refuses a delivered pointer reported for a mirror write", async () => {
    const { pool: p } = await owing();
    const lease = await claimOne(p);

    expect(
      await p.work.complete(lease.id, {
        kind: "delivered",
        pointer: "vault/inbox/a.md",
      }),
    ).toEqual({
      kind: "refused",
      refusal: { kind: "wrong-outcome", lease: lease.id, work: "mirror" },
    });
  });

  it("leaves the job claimable, since nothing was recorded about it", async () => {
    const { pool: p } = await owing();
    const lease = await claimOne(p);

    await p.work.complete(lease.id, { kind: "delivered" });
    await p.work.release(lease.id);

    expect((await claimOne(p)).job.id).toBe(lease.job.id);
  });
});

describe("leases", () => {
  it("extends the one it holds by the time it asks for", async () => {
    const { pool: p } = await owing();
    const lease = await claimOne(p);

    const extended = await p.work.extend(lease.id, 120_000 as Duration);

    expect(extended).toEqual({
      kind: "ok",
      value: { ...lease, expiresAt: at(secondsIn(120)) },
    });
  });

  it("hands work back to whoever claims next when released", async () => {
    const { pool: p } = await owing();
    const lease = await claimOne(p);

    expect(await p.work.release(lease.id)).toEqual({
      kind: "ok",
      value: undefined,
    });
    expect((await claimOne(p)).job.id).toBe(lease.job.id);
  });
});
