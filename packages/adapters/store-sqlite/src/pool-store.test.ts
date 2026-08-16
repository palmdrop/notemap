import type {
  Action,
  Item,
  ItemId,
  OrderedPage,
  Page,
  Position,
  RoutingRecord,
  Timestamp,
} from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import type { SqlitePoolStore } from "./pool-store";

import {
  appendCapture,
  asset,
  at,
  capture,
  captured,
  frozenClock,
  putAssets,
  markedProcessed,
  mirrorJob,
  revisionOf,
  SCRATCHPAD,
  store,
} from "./testing/fixture";

/** The store has no default order, so every read here names one. */
const ALL: OrderedPage = { limit: 50, order: "newest-first" };
const ALL_OLDEST: OrderedPage = { limit: 50, order: "oldest-first" };

const ids = (values: readonly Item[]) => values.map((item) => item.id);

/** `item-0`…`item-<count - 1>`, one minute apart, oldest first. */
async function minutelyItems(p: SqlitePoolStore, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await appendCapture(
      p,
      capture({
        id: `item-${index}`,
        createdAt: `2026-08-03T09:0${index}:00.000Z`,
      }),
    );
  }
}

function nextPage<P extends Page>(position: Position | undefined, page: P): P {
  if (position === undefined) throw new Error("expected another page");
  return { ...page, after: position };
}

const open: (() => Promise<void>)[] = [];

function pool(...args: Parameters<typeof store>) {
  const opened = store(...args);
  open.push(opened.cleanup);
  return opened;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((cleanup) => cleanup()));
});

describe("writing a capture", () => {
  it("reads back the payload, tags and assets it was given", async () => {
    const { pool: p } = pool();
    const record = capture({
      text: "a thought",
      tags: [
        {
          name: "kind/quote",
          by: { kind: "source", source: SCRATCHPAD },
          addedAt: "2026-08-03T09:00:00.000Z",
        },
      ],
      assets: [{ slot: "audio", asset: "asset-1" }],
    });
    await putAssets(p, asset({ filename: "interview-with-mum.opus" }));

    const stored = await appendCapture(p, record);

    expect(stored.payload.content).toEqual({ text: "a thought" });
    expect(stored.payload.type).toBe(record.payload.type);
    expect(stored.tags).toEqual(record.tags);
    expect(stored.payload.assets).toEqual(record.payload.assets);
    expect(await p.item(record.id)).toEqual(stored);
  });

  it("assigns the modifiedAt the record could not carry", async () => {
    const { pool: p } = pool();
    const record = capture();

    const stored = await appendCapture(p, record);

    expect(stored.modifiedAt).toEqual(expect.any(String));
    expect(Object.hasOwn(record, "modifiedAt")).toBe(false);
  });

  it("writes the action recording it", async () => {
    const { pool: p } = pool();
    const record = capture();

    await appendCapture(p, record);

    const logged = await p.actions({ item: record.id }, ALL);
    expect(logged.values).toHaveLength(1);
    expect(logged.values[0]).toMatchObject({
      kind: "captured",
      subject: record.id,
      by: { kind: "source", source: SCRATCHPAD },
    });
  });

  it("enqueues the work the capture owes", async () => {
    const { pool: p, raw } = pool();
    const record = capture();
    const job = mirrorJob(record);

    await appendCapture(p, record, [job]);

    expect(raw.prepare("select * from jobs").all()).toEqual([
      {
        id: job.id,
        kind: "mirror",
        subject_kind: "item",
        subject_id: record.id,
        enrichment: null,
        attempt: 0,
        enqueued_at: Date.parse(record.createdAt),
        next_attempt_at: Date.parse(record.createdAt),
        lease_id: null,
        lease_expires_at: null,
        abandoned_at: null,
        last_failure_code: null,
        last_failure_detail: null,
      },
    ]);
  });

  it("respells a timestamp canonically, whatever the source wrote", async () => {
    const { pool: p } = pool();
    const record = capture({ createdAt: "2026-08-03T09:15:00Z" });

    const stored = await appendCapture(p, record);

    expect(stored.createdAt).toBe("2026-08-03T09:15:00.000Z");
    expect(Date.parse(stored.createdAt)).toBe(Date.parse(record.createdAt));
  });
});

describe("revisions", () => {
  it("keeps the original's capture time and records the edit separately", async () => {
    const { pool: p } = pool();
    const original = capture({ id: "item-1" });
    await appendCapture(p, original);

    const revision = revisionOf(original, {
      id: "item-2",
      text: "reworded",
      editedAt: "2026-08-04T11:00:00.000Z",
    });
    const stored = await appendCapture(p, revision);

    expect(stored.createdAt).toBe(original.createdAt);
    expect(stored.contentUpdatedAt).toBe("2026-08-04T11:00:00.000Z");
    expect(stored.revisionOf).toBe("item-1");
  });

  it("may carry the source identity of the capture it revises", async () => {
    const { pool: p } = pool();
    const original = capture({ id: "item-1", sourceItemId: "src-a" });
    await appendCapture(p, original);

    const revision = revisionOf(original, {
      id: "item-2",
      text: "reworded",
      editedAt: "2026-08-04T11:00:00.000Z",
    });

    await expect(appendCapture(p, revision)).resolves.toMatchObject({
      sourceItemId: "src-a",
    });
  });

  it("marks the original superseded, and itself not", async () => {
    const { pool: p } = pool();
    const original = capture({ id: "item-1" });
    await appendCapture(p, original);

    expect((await p.item(original.id))?.supersededBy).toBeUndefined();

    const revision = revisionOf(original, {
      id: "item-2",
      text: "reworded",
      editedAt: "2026-08-04T11:00:00.000Z",
    });
    await appendCapture(p, revision);

    expect((await p.item(original.id))?.supersededBy).toBe("item-2");
    expect((await p.item(revision.id))?.supersededBy).toBeUndefined();
  });

  it("is not what a lookup by source identity answers with", async () => {
    const { pool: p } = pool();
    const original = capture({ id: "item-1", sourceItemId: "src-a" });
    await appendCapture(p, original);
    await appendCapture(
      p,
      revisionOf(original, {
        id: "item-2",
        text: "reworded",
        editedAt: "2026-08-04T11:00:00.000Z",
      }),
    );

    const found = await p.itemBySourceIdentity(SCRATCHPAD, "src-a");

    expect(found?.id).toBe("item-1");
  });
});

describe("a transaction", () => {
  it("shows core what it has written but not committed", async () => {
    const { pool: p } = pool();
    const record = capture({ id: "item-1", sourceItemId: "src-a" });

    const seen = await p.transaction(async (tx) => {
      await tx.insertItem(record);
      return {
        byId: await tx.item(record.id),
        bySource: await tx.itemBySourceIdentity(record.source, "src-a"),
        head: await tx.head(),
      };
    });

    expect(seen.byId?.id).toBe("item-1");
    expect(seen.bySource?.id).toBe("item-1");
    expect(seen.head?.id).toBe("item-1");
  });

  it("hides uncommitted writes from a read outside it", async () => {
    const { pool: p } = pool();
    const record = capture({ id: "item-1" });
    let seenMidFlight: Item | undefined;

    await p.transaction(async (tx) => {
      await tx.insertItem(record);
      // A reader that is not part of this transaction must not see it.
      seenMidFlight = await p.item(record.id);
    });

    expect(seenMidFlight).toBeUndefined();
    expect(await p.item(record.id)).toBeDefined();
  });

  it("discards everything it wrote when the work rejects", async () => {
    const { pool: p, raw } = pool();
    const record = capture();
    const boom = new Error("core changed its mind");

    await expect(
      p.transaction(async (tx) => {
        await tx.insertItem(record);
        await tx.enqueue([mirrorJob(record)]);
        await tx.appendAction(captured(record));
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(await p.item(record.id)).toBeUndefined();
    expect((await p.actions({}, ALL)).values).toEqual([]);
    expect(raw.prepare("select * from jobs").all()).toEqual([]);
  });

  it("keeps working after one rejects", async () => {
    const { pool: p } = pool();

    await expect(
      p.transaction(async () => {
        throw new Error("no");
      }),
    ).rejects.toThrow("no");

    const record = capture();
    await expect(appendCapture(p, record)).resolves.toMatchObject({
      id: record.id,
    });
  });

  it("queues a caller that arrives while another transaction is in flight", async () => {
    const { pool: p } = pool();

    const slow = p.transaction(async (tx) => {
      await tx.insertItem(capture({ id: "slow" }));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    // Arrives mid-flight, from an unrelated task — the case a plain boolean
    // reentrancy flag mistakes for a nested call and rejects.
    const later = new Promise<Item>((resolve, reject) => {
      setTimeout(() => {
        appendCapture(p, capture({ id: "later" })).then(resolve, reject);
      }, 10);
    });

    await slow;
    await expect(later).resolves.toMatchObject({ id: "later" });
    expect(await p.item("slow" as ItemId)).toBeDefined();
  });

  it("does not let two overlapping transactions interleave", async () => {
    const { pool: p } = pool();
    const order: string[] = [];

    const slow = p.transaction(async (tx) => {
      order.push("slow:start");
      await tx.insertItem(capture({ id: "slow" }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("slow:end");
    });

    const quick = p.transaction(async (tx) => {
      order.push("quick:start");
      await tx.insertItem(capture({ id: "quick" }));
      order.push("quick:end");
    });

    await Promise.all([slow, quick]);

    expect(order).toEqual([
      "slow:start",
      "slow:end",
      "quick:start",
      "quick:end",
    ]);
  });

  it("kills the handle once it has ended, so a leaked one cannot write", async () => {
    const { pool: p } = pool();
    let leaked: Parameters<Parameters<typeof p.transaction>[0]>[0] | undefined;

    await p.transaction(async (tx) => {
      leaked = tx;
    });

    // Without the fence this insert lands outside any transaction, committing
    // on its own — or inside whichever transaction started next.
    await expect(
      leaked?.insertItem(capture({ id: "escaped" })),
    ).rejects.toThrow(/transaction has ended/);
    expect(await p.item("escaped" as ItemId)).toBeUndefined();
  });

  it("rolls back a transaction that overruns, and stops it writing after", async () => {
    const { pool: p } = pool({ transactionTimeoutMs: 40 });
    let after: unknown;

    const stalled = p.transaction(async (tx) => {
      await tx.insertItem(capture({ id: "stalled" }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      // The callback keeps running after the timeout; the fence is what stops
      // this reaching the connection.
      after = await tx
        .insertItem(capture({ id: "after-timeout" }))
        .catch((error: Error) => error);
    });

    await expect(stalled).rejects.toThrow(/exceeded 40ms/);
    expect(await p.item("stalled" as ItemId)).toBeUndefined();

    // The pool still works once the overrunning transaction is out of the way.
    await expect(
      appendCapture(p, capture({ id: "next" })),
    ).resolves.toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(after).toBeInstanceOf(Error);
    expect(await p.item("after-timeout" as ItemId)).toBeUndefined();
  });

  it("refuses to open one inside another rather than waiting on itself", async () => {
    const { pool: p } = pool();

    await expect(
      p.transaction(async () => {
        await p.transaction(async () => undefined);
      }),
    ).rejects.toThrow("wait on itself");
  });

  it("tells a call that leaked out of an ended transaction so, not that it nested", async () => {
    const { pool: p } = pool();
    let escaped: Promise<unknown> | undefined;

    await p.transaction(async () => {
      // Fire-and-forget work spawned in the callback inherits its context and
      // outlives it; by the time this timer fires the transaction is over.
      escaped = new Promise((resolve, reject) => {
        setTimeout(() => {
          p.transaction(async () => undefined).then(resolve, reject);
        }, 20);
      });
    });

    await expect(escaped).rejects.toThrow(/already ended/);
  });
});

describe("the identity checks core makes inside a transaction", () => {
  it("sees an existing capture under either identity", async () => {
    const { pool: p } = pool();
    await appendCapture(p, capture({ id: "item-1", sourceItemId: "src-a" }));

    const seen = await p.transaction(async (tx) => ({
      byId: await tx.item("item-1" as ItemId),
      bySource: await tx.itemBySourceIdentity(SCRATCHPAD, "src-a"),
    }));

    expect(seen.byId?.id).toBe("item-1");
    expect(seen.bySource?.id).toBe("item-1");
  });

  it("leaves the pool untouched when core declines to insert", async () => {
    const { pool: p } = pool();
    await appendCapture(p, capture({ id: "item-1", sourceItemId: "src-a" }));

    const outcome = await p.transaction(async (tx) => {
      const existing = await tx.item("item-1" as ItemId);
      if (existing) return { refused: "already-captured" as const };
      await tx.insertItem(capture({ id: "item-1", text: "different" }));
      return { refused: undefined };
    });

    expect(outcome.refused).toBe("already-captured");
    expect((await p.actions({}, ALL)).values).toHaveLength(1);
    expect((await p.item("item-1" as ItemId))?.payload.content).toEqual({
      text: "a thought",
    });
  });

  it("backstops a duplicate id with a constraint rather than storing two", async () => {
    const { pool: p } = pool();
    await appendCapture(p, capture({ id: "item-1", sourceItemId: "src-a" }));

    await expect(
      appendCapture(p, capture({ id: "item-1", sourceItemId: "src-b" })),
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });

  it("backstops a duplicate source identity the same way", async () => {
    const { pool: p } = pool();
    await appendCapture(p, capture({ id: "item-1", sourceItemId: "src-a" }));

    await expect(
      appendCapture(p, capture({ id: "item-2", sourceItemId: "src-a" })),
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });
});

describe("modifiedAt", () => {
  it("increases strictly even while the clock stands still", async () => {
    const { pool: p } = pool({ clock: frozenClock() });

    const first = await appendCapture(p, capture({ id: "item-1" }));
    const second = await appendCapture(p, capture({ id: "item-2" }));

    expect(Date.parse(second.modifiedAt)).toBeGreaterThan(
      Date.parse(first.modifiedAt),
    );
  });

  it("does not go backwards when the clock does", async () => {
    const clock = frozenClock("2026-08-03T10:00:00.000Z");
    const { pool: p } = pool({ clock });

    const first = await appendCapture(p, capture({ id: "item-1" }));

    clock.set("2026-08-03T09:00:00.000Z");
    const second = await appendCapture(p, capture({ id: "item-2" }));

    expect(Date.parse(second.modifiedAt)).toBeGreaterThan(
      Date.parse(first.modifiedAt),
    );
  });
});

describe("the feed", () => {
  it("reads newest first when asked to", async () => {
    const { pool: p } = pool();
    await appendCapture(
      p,
      capture({ id: "older", createdAt: "2026-07-31T09:00:00.000Z" }),
    );
    await appendCapture(
      p,
      capture({ id: "newer", createdAt: "2026-08-03T09:00:00.000Z" }),
    );

    expect(ids((await p.feed(ALL)).values)).toEqual(["newer", "older"]);
  });

  it("orders by capture time, not by arrival", async () => {
    const { pool: p } = pool();
    await appendCapture(
      p,
      capture({ id: "recent", createdAt: "2026-08-03T09:00:00.000Z" }),
    );
    await appendCapture(
      p,
      capture({ id: "backdated", createdAt: "2026-07-31T09:00:00.000Z" }),
    );

    expect(ids((await p.feed(ALL)).values)).toEqual(["recent", "backdated"]);
  });

  it("reads oldest first when asked to", async () => {
    const { pool: p } = pool();
    await appendCapture(
      p,
      capture({ id: "older", createdAt: "2026-07-31T09:00:00.000Z" }),
    );
    await appendCapture(
      p,
      capture({ id: "newer", createdAt: "2026-08-03T09:00:00.000Z" }),
    );

    const page: OrderedPage = { limit: 50, order: "oldest-first" };
    expect(ids((await p.feed(page)).values)).toEqual(["older", "newer"]);
  });

  it("orders timestamps of differing precision correctly", async () => {
    const { pool: p } = pool();
    // As text these sort "00.500Z" < "00Z" < "01Z", which is not their order.
    const spellings = [
      ["b", "2026-08-03T09:00:00.500Z"],
      ["a", "2026-08-03T09:00:00Z"],
      ["c", "2026-08-03T09:00:01Z"],
    ] as const;

    for (const [id, createdAt] of spellings) {
      await appendCapture(p, capture({ id, createdAt }));
    }

    const page: OrderedPage = { limit: 50, order: "oldest-first" };
    expect(ids((await p.feed(page)).values)).toEqual(["a", "b", "c"]);
  });

  it("breaks a tie on capture time by id, without repeating or dropping", async () => {
    const { pool: p } = pool();
    // Same instant for all three, so only the id tie-break orders them.
    for (const id of ["c", "a", "b"]) {
      await appendCapture(
        p,
        capture({ id, createdAt: "2026-08-03T09:00:00.000Z" }),
      );
    }

    const page: OrderedPage = { limit: 2, order: "oldest-first" };
    const first = await p.feed(page);
    const second = await p.feed(nextPage(first.next, page));

    expect([...ids(first.values), ...ids(second.values)]).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("paginates through positions and stops without a trailing empty page", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 5);

    const page: OrderedPage = { limit: 2, order: "oldest-first" };
    const first = await p.feed(page);
    expect(ids(first.values)).toEqual(["item-0", "item-1"]);

    const second = await p.feed(nextPage(first.next, page));
    expect(ids(second.values)).toEqual(["item-2", "item-3"]);

    const third = await p.feed(nextPage(second.next, page));
    expect(ids(third.values)).toEqual(["item-4"]);
    expect(third.next).toBeUndefined();
  });

  it("paginates newest-first without repeating or skipping", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 5);

    const page: OrderedPage = { limit: 2, order: "newest-first" };
    const first = await p.feed(page);
    const second = await p.feed(nextPage(first.next, page));
    const third = await p.feed(nextPage(second.next, page));

    expect([
      ...ids(first.values),
      ...ids(second.values),
      ...ids(third.values),
    ]).toEqual(["item-4", "item-3", "item-2", "item-1", "item-0"]);
  });

  it("reads either order from one position, since it names a place", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 5);

    // The position after ["item-4", "item-3"], read from the newest end.
    const newest = await p.feed({ limit: 2, order: "newest-first" });
    const from = newest.next;

    expect(
      ids(
        (await p.feed(nextPage(from, { limit: 2, order: "newest-first" })))
          .values,
      ),
    ).toEqual(["item-2", "item-1"]);
    expect(
      ids(
        (await p.feed(nextPage(from, { limit: 2, order: "oldest-first" })))
          .values,
      ),
    ).toEqual(["item-4"]);
  });

  it("continues from a position whose row is gone", async () => {
    const { pool: p, raw } = pool();
    await minutelyItems(p, 5);

    const page: OrderedPage = { limit: 2, order: "newest-first" };
    const first = await p.feed(page);
    // The row the position names, purged between the two reads. A position is
    // compared against, never looked up, so the next page is unaffected.
    raw.prepare("DELETE FROM items WHERE id = ?").run("item-3");

    const second = await p.feed(nextPage(first.next, page));
    expect(ids(second.values)).toEqual(["item-2", "item-1"]);
  });

  it("takes a bare timestamp as a coarse entry point", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 5);

    const page: OrderedPage = { limit: 50, order: "oldest-first" };
    const from: Position = { at: at("2026-08-03T09:02:00.000Z") };

    expect(ids((await p.feed({ ...page, after: from })).values)).toEqual([
      "item-3",
      "item-4",
    ]);
  });

  it("skips rows sharing the instant a bare timestamp names", async () => {
    const { pool: p } = pool();
    const shared = "2026-08-03T09:00:00.000Z";
    for (const id of ["a", "b"]) {
      await appendCapture(p, capture({ id, createdAt: shared }));
    }
    await appendCapture(
      p,
      capture({ id: "c", createdAt: "2026-08-03T09:01:00.000Z" }),
    );

    // The cost of an entry point that names no row: the bound is strict on time
    // alone, so both rows at that instant fall outside it.
    const from: Position = { at: at(shared) };
    const page: OrderedPage = { limit: 50, order: "oldest-first", after: from };

    expect(ids((await p.feed(page)).values)).toEqual(["c"]);
  });

  it("refuses a position that names no instant, rather than reading from zero", async () => {
    const { pool: p } = pool();
    await appendCapture(p, capture());

    await expect(
      p.feed({
        limit: 1,
        order: "newest-first",
        after: { at: "half past four" as Timestamp },
      }),
    ).rejects.toThrow(/not a parseable timestamp/);
  });

  it("refuses a limit that is not a positive count", async () => {
    const { pool: p } = pool();
    await expect(p.feed({ limit: 0, order: "newest-first" })).rejects.toThrow(
      /positive integer/,
    );
  });

  it("hands back an empty slice for an empty pool", async () => {
    const { pool: p } = pool();
    expect(await p.feed(ALL)).toEqual({ values: [] });
  });
});

describe("the head", () => {
  it("is the newest by capture time, not the last written", async () => {
    const { pool: p } = pool();
    await appendCapture(
      p,
      capture({ id: "newest", createdAt: "2026-08-03T09:00:00.000Z" }),
    );
    await appendCapture(
      p,
      capture({ id: "backdated", createdAt: "2026-07-31T09:00:00.000Z" }),
    );

    expect((await p.head())?.id).toBe("newest");
  });

  it("is absent for an empty pool", async () => {
    const { pool: p } = pool();
    expect(await p.head()).toBeUndefined();
  });
});

describe("the action log", () => {
  const subjects = (slice: { values: readonly Action[] }) =>
    slice.values.map((action) => action.subject);

  it("filters by subject, and returns everything without a filter", async () => {
    const { pool: p } = pool();
    await appendCapture(p, capture({ id: "item-1" }));
    await appendCapture(p, capture({ id: "item-2" }));

    expect(
      (await p.actions({ item: "item-1" as ItemId }, ALL)).values,
    ).toHaveLength(1);
    expect((await p.actions({}, ALL)).values).toHaveLength(2);
  });

  it("reads from whichever end it is told to", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 3);

    expect(subjects(await p.actions({}, ALL))).toEqual([
      "item-2",
      "item-1",
      "item-0",
    ]);
    expect(subjects(await p.actions({}, ALL_OLDEST))).toEqual([
      "item-0",
      "item-1",
      "item-2",
    ]);
  });

  it("paginates through positions, oldest first", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 5);

    const page: OrderedPage = { limit: 2, order: "oldest-first" };
    const first = await p.actions({}, page);
    const second = await p.actions({}, nextPage(first.next, page));
    const third = await p.actions({}, nextPage(second.next, page));

    expect([first, second, third].flatMap(subjects)).toEqual([
      "item-0",
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);
    expect(third.next).toBeUndefined();
  });

  it("paginates newest first without repeating or skipping", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 5);

    const page: OrderedPage = { limit: 2, order: "newest-first" };
    const first = await p.actions({}, page);
    const second = await p.actions({}, nextPage(first.next, page));
    const third = await p.actions({}, nextPage(second.next, page));

    expect([first, second, third].flatMap(subjects)).toEqual([
      "item-4",
      "item-3",
      "item-2",
      "item-1",
      "item-0",
    ]);
    expect(third.next).toBeUndefined();
  });

  it("reads either order from one position, since it names a place", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 5);

    // The position after the two newest entries.
    const newest = await p.actions({}, { limit: 2, order: "newest-first" });
    const from = newest.next;

    expect(
      subjects(
        await p.actions(
          {},
          nextPage(from, { limit: 2, order: "newest-first" }),
        ),
      ),
    ).toEqual(["item-2", "item-1"]);
    expect(
      subjects(
        await p.actions(
          {},
          nextPage(from, { limit: 2, order: "oldest-first" }),
        ),
      ),
    ).toEqual(["item-4"]);
  });

  it("keeps the subject filter across a page boundary", async () => {
    const { pool: p } = pool();
    const record = capture({ id: "item-1" });
    await appendCapture(p, record);
    // A second entry about the same item, and one about another, so a page
    // continued from a position has both to exclude.
    await appendCapture(p, capture({ id: "item-2" }));
    await p.transaction(async (tx) => {
      await tx.appendAction({
        ...captured(record, "action-later"),
        at: at("2026-08-03T10:00:00.000Z"),
      });
    });

    const filter = { item: "item-1" as ItemId };
    const page: OrderedPage = { limit: 1, order: "oldest-first" };
    const first = await p.actions(filter, page);
    const second = await p.actions(filter, nextPage(first.next, page));

    expect(second.values.map((action) => action.id)).toEqual(["action-later"]);
    expect(second.next).toBeUndefined();

    const newest = await p.actions(filter, { ...page, order: "newest-first" });
    expect(newest.values.map((action) => action.id)).toEqual(["action-later"]);
  });

  it("answers for a subject the pool no longer holds", async () => {
    const { pool: p, raw } = pool();
    const record = capture({ id: "item-1" });
    await appendCapture(p, record);

    // What a purge leaves behind: the item is gone, its entries are not. The
    // table carries no foreign key precisely so that this read still works.
    raw.prepare("DELETE FROM items WHERE id = ?").run(record.id);

    expect(await p.item(record.id)).toBeUndefined();
    expect(subjects(await p.actions({ item: record.id }, ALL))).toEqual([
      "item-1",
    ]);
  });
});

describe("the queue and the archive", () => {
  const OLDEST_FIRST: OrderedPage = { limit: 50, order: "oldest-first" };
  const NEWEST_FIRST: OrderedPage = { limit: 50, order: "newest-first" };

  /** Sets or clears archive state the way core's archive and unarchive do. */
  function setArchived(
    p: SqlitePoolStore,
    item: string,
    state?: { archivedAt: string; reason?: string },
  ): Promise<Item> {
    return p.transaction(async (tx) =>
      tx.setArchiveState(
        item as ItemId,
        state === undefined
          ? undefined
          : {
              archivedAt: at(state.archivedAt),
              ...(state.reason === undefined ? {} : { reason: state.reason }),
            },
      ),
    );
  }

  function markProcessed(
    p: SqlitePoolStore,
    record: RoutingRecord,
  ): Promise<void> {
    return p.transaction((tx) => tx.insertRoutingRecord(record));
  }

  it("holds every unprocessed item, oldest first", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 3);

    expect(ids((await p.queue(OLDEST_FIRST)).values)).toEqual([
      "item-0",
      "item-1",
      "item-2",
    ]);
  });

  it("answers the same items from the other end when asked", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 3);

    const oldest = ids((await p.queue(OLDEST_FIRST)).values);
    const newest = ids((await p.queue(NEWEST_FIRST)).values);

    expect(newest).toEqual([...oldest].reverse());
  });

  it("continues either order from one position", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 4);

    const oldest = await p.queue({ limit: 2, order: "oldest-first" });
    const from = oldest.next;
    if (from === undefined) throw new Error("expected another page");

    // The same place, read both ways: forward finds what is left, backward
    // finds what the first page already handed out.
    expect(
      ids(
        (await p.queue({ limit: 50, order: "oldest-first", after: from }))
          .values,
      ),
    ).toEqual(["item-2", "item-3"]);
    expect(
      ids(
        (await p.queue({ limit: 50, order: "newest-first", after: from }))
          .values,
      ),
    ).toEqual(["item-0"]);
  });

  it("orders by content time, so a revision resurfaces at the newest end", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 3);
    const original = capture({
      id: "item-0",
      createdAt: "2026-08-03T09:00:00.000Z",
    });
    await appendCapture(
      p,
      revisionOf(original, {
        id: "revision",
        text: "reworded",
        editedAt: "2026-08-03T11:00:00.000Z",
      }),
    );

    expect(ids((await p.queue(OLDEST_FIRST)).values)).toEqual([
      "item-1",
      "item-2",
      "revision",
    ]);
  });

  it("moves an archived item out of the queue and into the archive", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 3);

    await setArchived(p, "item-1", {
      archivedAt: "2026-08-03T12:00:00.000Z",
      reason: "noise",
    });

    expect(ids((await p.queue(OLDEST_FIRST)).values)).toEqual([
      "item-0",
      "item-2",
    ]);
    expect(ids((await p.archived(OLDEST_FIRST)).values)).toEqual(["item-1"]);
  });

  it("returns an unarchived item to its original position", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 3);
    const before = ids((await p.queue(OLDEST_FIRST)).values);

    await setArchived(p, "item-1", { archivedAt: "2026-08-03T12:00:00.000Z" });
    await setArchived(p, "item-1", undefined);

    expect(ids((await p.queue(OLDEST_FIRST)).values)).toEqual(before);
    expect((await p.archived(OLDEST_FIRST)).values).toEqual([]);
    expect((await p.item("item-1" as ItemId))?.archived).toBeUndefined();
  });

  it("drops an item holding a routing record, archived or not", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 3);
    const routed = capture({ id: "item-1" });

    await markProcessed(p, markedProcessed(routed));

    expect(ids((await p.queue(OLDEST_FIRST)).values)).toEqual([
      "item-0",
      "item-2",
    ]);
    expect((await p.archived(OLDEST_FIRST)).values).toEqual([]);
  });

  it("keeps a routed *and* archived item in the archive alone", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 2);
    const both = capture({ id: "item-0" });

    await markProcessed(p, markedProcessed(both));
    await setArchived(p, "item-0", { archivedAt: "2026-08-03T12:00:00.000Z" });

    expect(ids((await p.queue(OLDEST_FIRST)).values)).toEqual(["item-1"]);
    expect(ids((await p.archived(OLDEST_FIRST)).values)).toEqual(["item-0"]);
  });

  it("shows a superseded item on neither surface", async () => {
    const { pool: p } = pool();
    const original = capture({ id: "item-1" });
    await appendCapture(p, original);
    await appendCapture(
      p,
      revisionOf(original, {
        id: "revision",
        text: "reworded",
        editedAt: "2026-08-04T11:00:00.000Z",
      }),
    );

    expect(ids((await p.queue(OLDEST_FIRST)).values)).toEqual(["revision"]);
    expect((await p.archived(OLDEST_FIRST)).values).toEqual([]);
  });

  it("paginates without a trailing empty page", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 5);

    const page: OrderedPage = { limit: 2, order: "oldest-first" };
    const first = await p.queue(page);
    const second = await p.queue(nextPage(first.next, page));
    const third = await p.queue(nextPage(second.next, page));

    expect(
      [first, second, third].flatMap((slice) => ids(slice.values)),
    ).toEqual(["item-0", "item-1", "item-2", "item-3", "item-4"]);
    expect(third.next).toBeUndefined();
  });

  it("neither skips nor repeats a row when a capture arrives mid-read", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 4);

    const page: OrderedPage = { limit: 2, order: "oldest-first" };
    const first = await p.queue(page);
    // New work lands ahead of an oldest-first reader, which is what makes the
    // keyset sound although the queue reorders under it.
    await appendCapture(
      p,
      capture({ id: "arrived", createdAt: "2026-08-03T09:30:00.000Z" }),
    );
    const second = await p.queue(nextPage(first.next, page));
    const third = await p.queue(nextPage(second.next, page));

    expect(
      [first, second, third].flatMap((slice) => ids(slice.values)),
    ).toEqual(["item-0", "item-1", "item-2", "item-3", "arrived"]);
    expect(third.next).toBeUndefined();
  });

  it("takes a bare timestamp as a coarse entry point", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 5);

    const from: Position = { at: at("2026-08-03T09:02:00.000Z") };

    expect(
      ids(
        (await p.queue({ limit: 50, order: "oldest-first", after: from }))
          .values,
      ),
    ).toEqual(["item-3", "item-4"]);
  });

  it("hands back an empty slice once the queue has drained", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 2);

    await setArchived(p, "item-0", { archivedAt: "2026-08-03T12:00:00.000Z" });
    await markProcessed(p, markedProcessed(capture({ id: "item-1" })));

    expect(await p.queue(OLDEST_FIRST)).toEqual({ values: [] });
  });
});

describe("routing records", () => {
  it("reads back what was written, oldest first", async () => {
    const { pool: p } = pool();
    const record = capture({ id: "item-1" });
    await appendCapture(p, record);

    await p.transaction(async (tx) => {
      await tx.insertRoutingRecord(
        markedProcessed(record, {
          id: "routing-2",
          at: "2026-08-03T11:00:00.000Z",
        }),
      );
      await tx.insertRoutingRecord(
        markedProcessed(record, {
          id: "routing-1",
          at: "2026-08-03T10:00:00.000Z",
          note: "into the vault",
        }),
      );
    });

    expect(await p.routingRecords(record.id)).toEqual([
      {
        id: "routing-1",
        item: "item-1",
        target: { kind: "user", note: "into the vault" },
        at: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "routing-2",
        item: "item-1",
        target: { kind: "user" },
        at: "2026-08-03T11:00:00.000Z",
      },
    ]);
  });

  it("bumps the item's modifiedAt, since a delta read has to carry it", async () => {
    const { pool: p } = pool();
    const record = capture({ id: "item-1" });
    const before = await appendCapture(p, record);

    await p.transaction((tx) =>
      tx.insertRoutingRecord(markedProcessed(record)),
    );

    const after = await p.item(record.id);
    expect(Date.parse(after?.modifiedAt ?? "")).toBeGreaterThan(
      Date.parse(before.modifiedAt),
    );
  });

  it("goes when its item does, being the item's own state", async () => {
    const { pool: p, raw } = pool();
    const record = capture({ id: "item-1" });
    await appendCapture(p, record);
    await p.transaction((tx) =>
      tx.insertRoutingRecord(markedProcessed(record)),
    );

    raw.exec("PRAGMA foreign_keys = ON");
    raw.prepare("DELETE FROM items WHERE id = ?").run(record.id);

    expect(raw.prepare("SELECT * FROM routing_records").all()).toEqual([]);
  });

  it("answers nothing for an item that has been nowhere", async () => {
    const { pool: p } = pool();
    const record = capture({ id: "item-1" });
    await appendCapture(p, record);

    expect(await p.routingRecords(record.id)).toEqual([]);
  });
});

describe("the unbuilt half of the store", () => {
  it("names the method it has not got to yet", async () => {
    const { pool: p } = pool();
    expect(() => p.revisionChain("item-1" as ItemId)).toThrow(
      /revisionChain is not implemented/,
    );
  });
});

describe("two stores in one process", () => {
  it("share nothing", async () => {
    const one = pool();
    const other = pool();
    const record = capture();

    await appendCapture(one.pool, record);

    expect(await one.pool.item(record.id)).toBeDefined();
    expect(await other.pool.item(record.id)).toBeUndefined();
  });
});
