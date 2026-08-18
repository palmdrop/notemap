import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  parseMirrorRecord,
  type Duration,
  type Item,
  type JobId,
  type Lease,
  type Pool,
} from "@notemap/core";
import { FAKE_KIND, fakeDestinations } from "@notemap/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import {
  at,
  drainWith,
  envelope,
  filesUnder,
  harness,
  itemRecord,
  storedRecord,
  type Harness,
  type Mirroring,
} from "./fixture";

const LEASE_FOR = 60_000 as Duration;

const open: Harness[] = [];

function pool(mirroring: Mirroring = "filesystem"): Harness {
  const opened = harness(undefined, mirroring);
  open.push(opened);
  return opened;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

function captured(result: Awaited<ReturnType<Pool["capture"]>>): Item {
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value.item;
}

describe("capture to disk", () => {
  it("leaves files matching what the pool holds", async () => {
    const harnessed = pool();
    const item = captured(
      await harnessed.pool.capture(envelope({ text: "worth keeping" })),
    );

    expect(await drainWith(harnessed)()).toBe(1);

    const stored = await storedRecord(harnessed.mirrorRoot);
    expect(stored).toEqual(await itemRecord(harnessed.pool, item.id));
    expect(stored.item.id).toBe(item.id);
    expect(stored.item.payload.content).toEqual({ text: "worth keeping" });
    expect(stored.modifiedAt).toBe(item.modifiedAt);
  });

  it("writes one pair per item, revisions and all", async () => {
    const harnessed = pool();
    for (const n of [1, 2, 3]) {
      await harnessed.pool.capture(
        envelope({
          sourceItemId: `src-${n}`,
          capturedAt: `2026-08-06T09:0${n}:00.000Z`,
        }),
      );
    }

    expect(await drainWith(harnessed)()).toBe(3);
    expect(await filesUnder(harnessed.mirrorRoot)).toHaveLength(6);
  });

  it("owes nothing when no writer is wired, and writes nothing", async () => {
    const harnessed = pool("off");

    await harnessed.pool.capture(envelope());

    expect(await drainWith(harnessed)()).toBe(0);
    expect(await filesUnder(harnessed.mirrorRoot)).toEqual([]);
  });
});

describe("an unwritable mirror root", () => {
  it("retries and recovers, without ever having been abandoned", async () => {
    const harnessed = pool();
    const item = captured(await harnessed.pool.capture(envelope()));

    // A file where the tree should be: every write below it fails.
    await mkdir(join(harnessed.mirrorRoot, ".."), { recursive: true });
    await writeFile(harnessed.mirrorRoot, "not a directory", "utf8");

    const drain = drainWith(harnessed);
    expect(await drain()).toBe(1);
    expect(await filesUnder(harnessed.mirrorRoot)).toEqual([]);
    expect((await harnessed.pool.work.abandoned({ limit: 10 })).values).toEqual(
      [],
    );

    // Still owed, and waiting out its backoff rather than gone.
    expect(await drain()).toBe(0);

    await rm(harnessed.mirrorRoot);
    harnessed.clock.set("2026-08-06T09:05:00.000Z");

    expect(await drain()).toBe(1);
    const stored = await storedRecord(harnessed.mirrorRoot);
    expect(stored.item.id).toBe(item.id);
  });

  it("keeps retrying well past the attempt limit enrichment lives under", async () => {
    const harnessed = pool();
    await harnessed.pool.capture(envelope());
    await mkdir(join(harnessed.mirrorRoot, ".."), { recursive: true });
    await writeFile(harnessed.mirrorRoot, "not a directory", "utf8");

    const drain = drainWith(harnessed);
    for (let minute = 1; minute <= 20; minute += 1) {
      expect(await drain()).toBe(1);
      harnessed.clock.set(
        `2026-08-06T09:${String(minute).padStart(2, "0")}:00.000Z`,
      );
    }

    expect((await harnessed.pool.work.abandoned({ limit: 10 })).values).toEqual(
      [],
    );
  });
});

describe("a mutation arriving while a write is in flight", () => {
  /**
   * The race coalescing exists for, and the only one that loses material with
   * nothing recording the loss. The mutation is stood in for by enqueuing the
   * job a mutation would enqueue — `edit`, `tag` and `archive` are not built,
   * and each owes this same enqueue when it is.
   */
  async function mutateDuring(lease: Lease, harnessed: Harness): Promise<void> {
    await harnessed.store.transaction((tx) =>
      tx.enqueue([
        {
          id: "job-from-the-mutation" as JobId,
          kind: "mirror",
          subject: lease.job.subject,
          attempt: 0,
          enqueuedAt: at("2026-08-06T09:00:00.000Z"),
        },
      ]),
    );
  }

  it("is written by a later job rather than absorbed into the one running", async () => {
    const harnessed = pool();
    await harnessed.pool.capture(envelope());

    const [lease] = await harnessed.pool.work.claim({
      kinds: ["mirror"],
      limit: 10,
      leaseFor: LEASE_FOR,
    });
    if (lease === undefined) throw new Error("expected a claimable job");

    await mutateDuring(lease, harnessed);
    await harnessed.pool.work.complete(lease.id, { kind: "succeeded" });

    // The job the mutation enqueued survived the one that was in flight.
    const remaining = await harnessed.pool.work.claim({
      kinds: ["mirror"],
      limit: 10,
      leaseFor: LEASE_FOR,
    });
    expect(remaining.map((each) => each.job.id)).toEqual([
      "job-from-the-mutation",
    ]);

    for (const each of remaining) await harnessed.pool.work.release(each.id);

    // And it is what actually puts the item on disk.
    expect(await drainWith(harnessed)()).toBe(1);
    expect(await filesUnder(harnessed.mirrorRoot)).toHaveLength(2);
  });

  /**
   * The failure path takes a different route through the store from the success
   * one, and it is the path a folder going offline mid-write actually takes.
   */
  it("records the failed attempt rather than rejecting the whole drain", async () => {
    const harnessed = pool();
    await harnessed.pool.capture(envelope());

    const [lease] = await harnessed.pool.work.claim({
      kinds: ["mirror"],
      limit: 10,
      leaseFor: LEASE_FOR,
    });
    if (lease === undefined) throw new Error("expected a claimable job");

    await mutateDuring(lease, harnessed);

    await expect(
      harnessed.pool.work.complete(lease.id, {
        kind: "failed",
        retryable: true,
        detail: { code: "folder-offline", detail: "ENOENT" },
      }),
    ).resolves.toEqual({ kind: "ok", value: undefined });

    // The mutation's job is left to do the write, and says everything the
    // failed one would have.
    const remaining = await harnessed.pool.work.claim({
      kinds: ["mirror"],
      limit: 10,
      leaseFor: LEASE_FOR,
    });
    expect(remaining.map((each) => each.job.id)).toEqual([
      "job-from-the-mutation",
    ]);
    for (const each of remaining) await harnessed.pool.work.release(each.id);

    expect(await drainWith(harnessed)()).toBe(1);
    expect(await filesUnder(harnessed.mirrorRoot)).toHaveLength(2);
  });

  it("never lets two writes for one item be in flight at once", async () => {
    const harnessed = pool();
    await harnessed.pool.capture(envelope());

    const [lease] = await harnessed.pool.work.claim({
      kinds: ["mirror"],
      limit: 10,
      leaseFor: LEASE_FOR,
    });
    if (lease === undefined) throw new Error("expected a claimable job");
    await mutateDuring(lease, harnessed);

    const second = await harnessed.pool.work.claim({
      kinds: ["mirror"],
      limit: 10,
      leaseFor: LEASE_FOR,
    });

    expect(second).toEqual([]);
  });
});

/**
 * The mirror's one non-item unit. A delivered routing record names a
 * destination, so a mirror that carried only items would rebuild a pool whose
 * records refer to destinations it cannot produce.
 */
describe("a destination on disk", () => {
  function pooled(): Harness {
    const opened = harness(undefined, "filesystem", fakeDestinations());
    open.push(opened);
    return opened;
  }

  async function vault(harnessed: Harness) {
    const created = await harnessed.pool.destinations.create({
      name: "Vault",
      kind: FAKE_KIND,
      settings: {},
    });
    if (created.kind === "refused") {
      throw new Error(`refused: ${JSON.stringify(created.refusal)}`);
    }
    return created.value;
  }

  const files = (harnessed: Harness) => filesUnder(harnessed.mirrorRoot);

  it("owes a write the moment it is created, and lands a file of its own", async () => {
    const harnessed = pooled();
    const created = await vault(harnessed);

    expect(await drainWith(harnessed)()).toBe(1);

    expect(await files(harnessed)).toEqual([
      join(harnessed.mirrorRoot, "destinations", `${created.id}.json`),
    ]);
    expect(
      await harnessed.pool.mirror.recordFor({
        kind: "destination",
        destination: created.id,
      }),
    ).toMatchObject({ kind: "destination", destination: { name: "Vault" } });
  });

  it("owes another on every edit, and the file says what the pool says", async () => {
    const harnessed = pooled();
    const created = await vault(harnessed);
    await drainWith(harnessed)();

    await harnessed.pool.destinations.rename(created.id, "Second brain");
    expect(await drainWith(harnessed)()).toBe(1);

    const stored = parseMirrorRecord(
      await readFile(
        join(harnessed.mirrorRoot, "destinations", `${created.id}.json`),
        "utf8",
      ),
    );
    if (stored.kind !== "destination")
      throw new Error("expected a destination");
    expect(stored.destination.name).toBe("Second brain");
  });

  /** Being retired is exactly the state of a destination that records still name. */
  it("carries a retired one rather than dropping it", async () => {
    const harnessed = pooled();
    const created = await vault(harnessed);
    await harnessed.pool.destinations.retire(created.id);

    await drainWith(harnessed)();

    const stored = parseMirrorRecord(
      await readFile(
        join(harnessed.mirrorRoot, "destinations", `${created.id}.json`),
        "utf8",
      ),
    );
    if (stored.kind !== "destination")
      throw new Error("expected a destination");
    expect(stored.destination.retiredAt).toBeDefined();
  });

  it("takes its file with it when it is deleted", async () => {
    const harnessed = pooled();
    const created = await vault(harnessed);
    await drainWith(harnessed)();

    expect((await harnessed.pool.destinations.delete(created.id)).kind).toBe(
      "ok",
    );
    expect(await drainWith(harnessed)()).toBe(1);

    expect(await files(harnessed)).toEqual([]);
  });

  it("writes beside items rather than instead of them", async () => {
    const harnessed = pooled();
    const created = await vault(harnessed);
    captured(await harnessed.pool.capture(envelope({ text: "a thought" })));

    await drainWith(harnessed)();

    const written = await files(harnessed);
    expect(written).toContain(
      join(harnessed.mirrorRoot, "destinations", `${created.id}.json`),
    );
    expect(written.filter((path) => path.endsWith(".md"))).toHaveLength(1);
  });
});
