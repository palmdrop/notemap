import type { FeedPage, Item, ItemId, Page, PageCursor } from "@notemap/core";
import { describe, expect, it } from "vitest";

import {
  appendCapture,
  capture,
  captured,
  fileStore,
  frozenClock,
  mirrorJob,
  SCRATCHPAD,
  store,
} from "./testing/fixture";

const ALL: Page = { limit: 50 };

const ids = (values: readonly Item[]) => values.map((item) => item.id);

function nextPage(cursor: PageCursor | undefined, page: FeedPage): FeedPage {
  if (cursor === undefined) throw new Error("expected another page");
  return { ...page, after: cursor };
}

describe("writing a capture", () => {
  it("reads back the payload, tags and assets it was given", async () => {
    const pool = store();
    const record = capture({
      text: "a thought",
      tags: [
        {
          name: "kind/quote",
          by: { kind: "source", source: SCRATCHPAD },
          addedAt: "2026-08-03T09:00:00.000Z",
        },
      ],
      assets: [{ slot: "audio", asset: "asset-1", hash: "sha256-abc" }],
    });

    const stored = await appendCapture(pool, record);

    expect(stored.payload.content).toEqual({ text: "a thought" });
    expect(stored.payload.type).toBe(record.payload.type);
    expect(stored.tags).toEqual(record.tags);
    expect(stored.payload.assets).toEqual(record.payload.assets);
    expect(await pool.item(record.id)).toEqual(stored);
  });

  it("assigns the modifiedAt the record could not carry", async () => {
    const pool = store();
    const record = capture();

    const stored = await appendCapture(pool, record);

    expect(stored.modifiedAt).toEqual(expect.any(String));
    expect(Object.hasOwn(record, "modifiedAt")).toBe(false);
  });

  it("derives supersededBy only once a revision points at the item", async () => {
    const pool = store();
    const original = capture({ id: "item-1" });
    await appendCapture(pool, original);

    expect((await pool.item(original.id))?.supersededBy).toBeUndefined();

    const revision = capture({
      id: "item-2",
      revisionOf: "item-1",
      createdAt: "2026-08-03T10:00:00.000Z",
    });
    await appendCapture(pool, revision);

    expect((await pool.item(original.id))?.supersededBy).toBe("item-2");
    expect((await pool.item(revision.id))?.supersededBy).toBeUndefined();
  });

  it("writes the action recording it", async () => {
    const pool = store();
    const record = capture();

    await appendCapture(pool, record);

    const logged = await pool.actions(record.id, ALL);
    expect(logged.values).toHaveLength(1);
    expect(logged.values[0]).toMatchObject({
      kind: "captured",
      subject: record.id,
      by: { kind: "source", source: SCRATCHPAD },
    });
  });

  it("enqueues the work the capture owes", async () => {
    const opened = fileStore();
    try {
      const record = capture();
      const job = mirrorJob(record);

      await appendCapture(opened.store, record, [job]);

      expect(opened.raw.prepare("select * from jobs").all()).toEqual([
        {
          id: job.id,
          kind: "mirror",
          subject: record.id,
          enrichment: null,
          attempt: 0,
          enqueued_at: Date.parse(record.createdAt),
        },
      ]);
    } finally {
      opened.cleanup();
    }
  });
});

describe("a transaction", () => {
  it("shows core what it has written but not committed", async () => {
    const pool = store();
    const record = capture({ id: "item-1", sourceItemId: "src-a" });

    const seen = await pool.transaction(async (tx) => {
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

  it("discards everything it wrote when the work rejects", async () => {
    const opened = fileStore();
    try {
      const record = capture();
      const boom = new Error("core changed its mind");

      await expect(
        opened.store.transaction(async (tx) => {
          await tx.insertItem(record);
          await tx.enqueue([mirrorJob(record)]);
          await tx.appendAction(captured(record));
          throw boom;
        }),
      ).rejects.toBe(boom);

      expect(await opened.store.item(record.id)).toBeUndefined();
      expect((await opened.store.actions(undefined, ALL)).values).toEqual([]);
      expect(opened.raw.prepare("select * from jobs").all()).toEqual([]);
    } finally {
      opened.cleanup();
    }
  });

  it("keeps working after one rejects", async () => {
    const pool = store();

    await expect(
      pool.transaction(async () => {
        throw new Error("no");
      }),
    ).rejects.toThrow("no");

    const record = capture();
    await expect(appendCapture(pool, record)).resolves.toMatchObject({
      id: record.id,
    });
  });

  it("does not let two overlapping transactions interleave", async () => {
    const pool = store();
    const order: string[] = [];

    const slow = pool.transaction(async (tx) => {
      order.push("slow:start");
      await tx.insertItem(capture({ id: "slow" }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("slow:end");
    });

    const quick = pool.transaction(async (tx) => {
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

  it("refuses to open one inside another rather than deadlocking", async () => {
    const pool = store();

    await expect(
      pool.transaction(async () => {
        await pool.transaction(async () => undefined);
      }),
    ).rejects.toThrow("deadlock");
  });
});

describe("the identity checks core makes inside a transaction", () => {
  it("sees an existing capture under either identity", async () => {
    const pool = store();
    const first = capture({ id: "item-1", sourceItemId: "src-a" });
    await appendCapture(pool, first);

    const seen = await pool.transaction(async (tx) => ({
      byId: await tx.item("item-1" as ItemId),
      bySource: await tx.itemBySourceIdentity(SCRATCHPAD, "src-a"),
    }));

    expect(seen.byId?.id).toBe("item-1");
    expect(seen.bySource?.id).toBe("item-1");
  });

  it("leaves the pool untouched when core declines to insert", async () => {
    const opened = fileStore();
    try {
      const first = capture({ id: "item-1", sourceItemId: "src-a" });
      await appendCapture(opened.store, first);

      const outcome = await opened.store.transaction(async (tx) => {
        const existing = await tx.item("item-1" as ItemId);
        if (existing) return { refused: "already-captured" as const };
        await tx.insertItem(capture({ id: "item-1", text: "different" }));
        return { refused: undefined };
      });

      expect(outcome.refused).toBe("already-captured");
      expect((await opened.store.actions(undefined, ALL)).values).toHaveLength(
        1,
      );
      expect(
        (await opened.store.item("item-1" as ItemId))?.payload.content,
      ).toEqual({ text: "a thought" });
    } finally {
      opened.cleanup();
    }
  });

  it("backstops a duplicate id with a constraint rather than storing two", async () => {
    const pool = store();
    const record = capture({ id: "item-1", sourceItemId: "src-a" });
    await appendCapture(pool, record);

    await expect(
      appendCapture(pool, capture({ id: "item-1", sourceItemId: "src-b" })),
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });

  it("backstops a duplicate source identity the same way", async () => {
    const pool = store();
    await appendCapture(pool, capture({ id: "item-1", sourceItemId: "src-a" }));

    await expect(
      appendCapture(pool, capture({ id: "item-2", sourceItemId: "src-a" })),
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });
});

describe("modifiedAt", () => {
  it("increases strictly even while the clock stands still", async () => {
    const clock = frozenClock(1_000);
    const pool = store(clock.now);

    const first = await appendCapture(pool, capture({ id: "item-1" }));
    const second = await appendCapture(pool, capture({ id: "item-2" }));

    expect(Date.parse(second.modifiedAt)).toBeGreaterThan(
      Date.parse(first.modifiedAt),
    );
  });

  it("does not go backwards when the clock does", async () => {
    const clock = frozenClock(10_000);
    const pool = store(clock.now);

    const first = await appendCapture(pool, capture({ id: "item-1" }));

    clock.set(5_000);
    const second = await appendCapture(pool, capture({ id: "item-2" }));

    expect(Date.parse(second.modifiedAt)).toBeGreaterThan(
      Date.parse(first.modifiedAt),
    );
  });
});

describe("the feed", () => {
  it("reads newest first by default", async () => {
    const pool = store();
    await appendCapture(
      pool,
      capture({ id: "older", createdAt: "2026-07-31T09:00:00.000Z" }),
    );
    await appendCapture(
      pool,
      capture({ id: "newer", createdAt: "2026-08-03T09:00:00.000Z" }),
    );

    expect(ids((await pool.feed(ALL)).values)).toEqual(["newer", "older"]);
  });

  it("orders by capture time, not by arrival", async () => {
    const pool = store();
    await appendCapture(
      pool,
      capture({ id: "recent", createdAt: "2026-08-03T09:00:00.000Z" }),
    );
    await appendCapture(
      pool,
      capture({ id: "backdated", createdAt: "2026-07-31T09:00:00.000Z" }),
    );

    expect(ids((await pool.feed(ALL)).values)).toEqual(["recent", "backdated"]);
  });

  it("reads oldest first when asked to", async () => {
    const pool = store();
    await appendCapture(
      pool,
      capture({ id: "older", createdAt: "2026-07-31T09:00:00.000Z" }),
    );
    await appendCapture(
      pool,
      capture({ id: "newer", createdAt: "2026-08-03T09:00:00.000Z" }),
    );

    const page: FeedPage = { limit: 50, order: "oldest-first" };
    expect(ids((await pool.feed(page)).values)).toEqual(["older", "newer"]);
  });

  it("orders timestamps of differing precision correctly", async () => {
    const pool = store();
    // As text these sort "00.500Z" < "00Z" < "01Z", which is not their order.
    const spellings = [
      ["b", "2026-08-03T09:00:00.500Z"],
      ["a", "2026-08-03T09:00:00Z"],
      ["c", "2026-08-03T09:00:01Z"],
    ] as const;

    for (const [id, createdAt] of spellings) {
      await appendCapture(pool, capture({ id, createdAt }));
    }

    const page: FeedPage = { limit: 50, order: "oldest-first" };
    expect(ids((await pool.feed(page)).values)).toEqual(["a", "b", "c"]);
  });

  it("paginates with a cursor and stops without a trailing empty page", async () => {
    const pool = store();
    for (let index = 0; index < 5; index += 1) {
      await appendCapture(
        pool,
        capture({
          id: `item-${index}`,
          createdAt: `2026-08-03T09:0${index}:00.000Z`,
        }),
      );
    }

    const page: FeedPage = { limit: 2, order: "oldest-first" };
    const first = await pool.feed(page);
    expect(ids(first.values)).toEqual(["item-0", "item-1"]);

    const second = await pool.feed(nextPage(first.next, page));
    expect(ids(second.values)).toEqual(["item-2", "item-3"]);

    const third = await pool.feed(nextPage(second.next, page));
    expect(ids(third.values)).toEqual(["item-4"]);
    expect(third.next).toBeUndefined();
  });

  it("paginates newest-first without repeating or skipping", async () => {
    const pool = store();
    for (let index = 0; index < 5; index += 1) {
      await appendCapture(
        pool,
        capture({
          id: `item-${index}`,
          createdAt: `2026-08-03T09:0${index}:00.000Z`,
        }),
      );
    }

    const page: FeedPage = { limit: 2 };
    const first = await pool.feed(page);
    const second = await pool.feed(nextPage(first.next, page));
    const third = await pool.feed(nextPage(second.next, page));

    expect([
      ...ids(first.values),
      ...ids(second.values),
      ...ids(third.values),
    ]).toEqual(["item-4", "item-3", "item-2", "item-1", "item-0"]);
  });

  it("refuses a cursor issued for the other order", async () => {
    const pool = store();
    for (const id of ["a", "b", "c"]) {
      await appendCapture(pool, capture({ id }));
    }

    const newest = await pool.feed({ limit: 1 });
    await expect(
      pool.feed(nextPage(newest.next, { limit: 1, order: "oldest-first" })),
    ).rejects.toThrow(/different order/);
  });

  it("hands back an empty slice for an empty pool", async () => {
    expect(await store().feed(ALL)).toEqual({ values: [] });
  });
});

describe("the head", () => {
  it("is the newest by capture time, not the last written", async () => {
    const pool = store();
    await appendCapture(
      pool,
      capture({ id: "newest", createdAt: "2026-08-03T09:00:00.000Z" }),
    );
    await appendCapture(
      pool,
      capture({ id: "backdated", createdAt: "2026-07-31T09:00:00.000Z" }),
    );

    expect((await pool.head())?.id).toBe("newest");
  });

  it("is absent for an empty pool", async () => {
    expect(await store().head()).toBeUndefined();
  });
});

describe("the action log", () => {
  it("filters by subject, and returns everything without one", async () => {
    const pool = store();
    await appendCapture(pool, capture({ id: "item-1" }));
    await appendCapture(pool, capture({ id: "item-2" }));

    expect((await pool.actions("item-1" as ItemId, ALL)).values).toHaveLength(
      1,
    );
    expect((await pool.actions(undefined, ALL)).values).toHaveLength(2);
  });
});

describe("two stores in one process", () => {
  it("share nothing", async () => {
    const one = store();
    const other = store();
    const record = capture();

    await appendCapture(one, record);

    expect(await one.item(record.id)).toBeDefined();
    expect(await other.item(record.id)).toBeUndefined();
  });
});
