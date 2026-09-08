import type {
  Action,
  Agent,
  AssetId,
  BlobHash,
  CapabilityName,
  DestinationId,
  Duration,
  Item,
  ItemId,
  OrderedPage,
  Page,
  Position,
  RoutingRecord,
  RoutingRecordId,
  SourceId,
  TagName,
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
  deliveryJob,
  destination,
  frozenClock,
  markedProcessed,
  mirrorJob,
  putAssets,
  putDestinations,
  reserved,
  revisionOf,
  SCRATCHPAD,
  store,
  TEXT,
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
        subject_item: record.id,
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
  it("carries its own capture time and the link to what it came from", async () => {
    const { pool: p } = pool();
    const original = capture({ id: "item-1" });
    await appendCapture(p, original);

    const revision = revisionOf(original, {
      id: "item-2",
      text: "reworded",
      at: "2026-08-04T11:00:00.000Z",
    });
    const stored = await appendCapture(p, revision);

    expect(stored.createdAt).toBe("2026-08-04T11:00:00.000Z");
    expect(stored.contentUpdatedAt).toBeUndefined();
    expect(stored.revisionOf).toBe("item-1");
  });

  it("names itself on the item it came from, and is named by nothing", async () => {
    const { pool: p } = pool();
    const original = capture({ id: "item-1" });
    await appendCapture(p, original);

    expect((await p.item(original.id))?.revisedInto).toEqual([]);

    const revision = revisionOf(original, {
      id: "item-2",
      text: "reworded",
      at: "2026-08-04T11:00:00.000Z",
    });
    await appendCapture(p, revision);

    expect((await p.item(original.id))?.revisedInto).toEqual(["item-2"]);
    expect((await p.item(revision.id))?.revisedInto).toEqual([]);
  });

  it("is read back beside the other revisions of one item", async () => {
    const { pool: p } = pool();
    const original = capture({ id: "item-1" });
    await appendCapture(p, original);

    for (const [id, at] of [
      ["item-2", "2026-08-04T11:00:00.000Z"],
      ["item-3", "2026-08-05T11:00:00.000Z"],
    ] as const) {
      await appendCapture(p, revisionOf(original, { id, text: "again", at }));
    }

    expect((await p.item(original.id))?.revisedInto).toEqual([
      "item-2",
      "item-3",
    ]);
  });

  it("is what a lookup by its own source identity answers with", async () => {
    const { pool: p } = pool();
    const original = capture({ id: "item-1", sourceItemId: "src-a" });
    await appendCapture(p, original);
    await appendCapture(
      p,
      revisionOf(original, {
        id: "item-2",
        text: "reworded",
        at: "2026-08-04T11:00:00.000Z",
      }),
    );

    expect((await p.itemBySourceIdentity(SCRATCHPAD, "src-a"))?.id).toBe(
      "item-1",
    );
    expect((await p.itemBySourceIdentity(SCRATCHPAD, "src-item-2"))?.id).toBe(
      "item-2",
    );
  });

  it("refuses an identity another item already claims", async () => {
    const { pool: p } = pool();
    const original = capture({ id: "item-1", sourceItemId: "src-a" });
    await appendCapture(p, original);

    const revision = capture({
      id: "item-2",
      sourceItemId: "src-a",
      revisionOf: "item-1",
      createdAt: "2026-08-04T11:00:00.000Z",
    });

    await expect(appendCapture(p, revision)).rejects.toThrow(/UNIQUE/);
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
        inFeed: await tx.feed(ALL),
      };
    });

    expect(seen.byId?.id).toBe("item-1");
    expect(seen.bySource?.id).toBe("item-1");
    expect(ids(seen.inFeed.values)).toEqual(["item-1"]);
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

describe("what an item answers about its assets", () => {
  it("resolves every attachment, in slot order", async () => {
    const { pool: p } = pool();
    await putAssets(
      p,
      asset({ id: "asset-1" as AssetId, filename: "mum.png", bytes: 40 }),
      asset({
        id: "asset-2" as AssetId,
        filename: "notes.txt",
        mime: "text/plain",
        bytes: 7,
      }),
    );
    const record = capture({
      assets: [
        { slot: "001", asset: "asset-2" },
        { slot: "000", asset: "asset-1" },
      ],
    });

    const stored = await appendCapture(p, record);

    expect(stored.assets).toEqual([
      {
        id: "asset-1",
        filename: "mum.png",
        mime: "image/png",
        blob: "blob-abc",
        bytes: 40,
      },
      {
        id: "asset-2",
        filename: "notes.txt",
        mime: "text/plain",
        blob: "blob-abc",
        bytes: 7,
      },
    ]);
  });

  it("omits the field where the payload references none", async () => {
    const { pool: p } = pool();

    const stored = await appendCapture(p, capture());

    expect(Object.hasOwn(stored, "assets")).toBe(false);
  });

  it("answers it per row of the feed", async () => {
    const { pool: p } = pool();
    await putAssets(p, asset({ id: "asset-1" as AssetId }));
    await appendCapture(
      p,
      capture({
        id: "with",
        createdAt: "2026-08-03T09:00:00.000Z",
        assets: [{ slot: "000", asset: "asset-1" }],
      }),
    );
    await appendCapture(
      p,
      capture({ id: "without", createdAt: "2026-07-31T09:00:00.000Z" }),
    );

    const { values } = await p.feed(ALL);

    expect(values.map((item) => item.assets)).toEqual([
      [asset({ id: "asset-1" as AssetId })],
      undefined,
    ]);
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

  it("pages across an item and its revision, each at its own time", async () => {
    const { pool: p } = pool();
    const original = capture({
      id: "item-0",
      createdAt: "2026-08-03T09:00:00.000Z",
    });
    await appendCapture(p, original);
    await appendCapture(
      p,
      capture({ id: "item-1", createdAt: "2026-08-03T09:30:00.000Z" }),
    );
    await appendCapture(
      p,
      revisionOf(original, {
        id: "revision",
        text: "reworded",
        at: "2026-08-03T10:00:00.000Z",
      }),
    );

    const oldest: OrderedPage = { limit: 2, order: "oldest-first" };
    const first = await p.feed(oldest);
    const second = await p.feed(nextPage(first.next, oldest));

    expect(ids(first.values)).toEqual(["item-0", "item-1"]);
    expect(ids(second.values)).toEqual(["revision"]);
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

  it("orders by capture time, so a revision arrives at the newest end", async () => {
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
        at: "2026-08-03T11:00:00.000Z",
      }),
    );

    expect(ids((await p.queue(OLDEST_FIRST)).values)).toEqual([
      "item-1",
      "item-2",
      "revision",
    ]);
  });

  it("does not reorder under an amendment", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 3);

    await p.transaction((tx) =>
      tx.amendItem(
        "item-0" as ItemId,
        {
          type: TEXT,
          content: { text: "reworded in place" },
          metadata: {},
          assets: [],
        },
        at("2026-08-03T11:00:00.000Z"),
      ),
    );

    expect(ids((await p.queue(OLDEST_FIRST)).values)).toEqual([
      "item-0",
      "item-1",
      "item-2",
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

  it("shows an item something was revised from on neither surface", async () => {
    const { pool: p } = pool();
    const original = capture({ id: "item-1" });
    await appendCapture(p, original);
    await appendCapture(
      p,
      revisionOf(original, {
        id: "revision",
        text: "reworded",
        at: "2026-08-04T11:00:00.000Z",
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

  it("breaks a tie on content time by id, without repeating or dropping", async () => {
    const { pool: p } = pool();
    // One instant for all three, so only the id tie-break orders them.
    for (const id of ["c", "a", "b"]) {
      await appendCapture(
        p,
        capture({ id, createdAt: "2026-08-03T09:00:00.000Z" }),
      );
    }

    const page: OrderedPage = { limit: 2, order: "oldest-first" };
    const first = await p.queue(page);
    const second = await p.queue(nextPage(first.next, page));

    expect([...ids(first.values), ...ids(second.values)]).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(second.next).toBeUndefined();
  });

  it("misses a row unarchived behind the reader, and hands it to the next read", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 4);
    await setArchived(p, "item-1", { archivedAt: "2026-08-03T12:00:00.000Z" });

    const page: OrderedPage = { limit: 2, order: "oldest-first" };
    const first = await p.queue(page);
    // Unarchiving restores the content time the item left with, which is behind
    // a reader that has already paged past it.
    await setArchived(p, "item-1", undefined);
    const second = await p.queue(nextPage(first.next, page));

    expect([first, second].flatMap((slice) => ids(slice.values))).toEqual([
      "item-0",
      "item-2",
      "item-3",
    ]);
    expect(second.next).toBeUndefined();
    expect(ids((await p.queue(OLDEST_FIRST)).values)).toEqual([
      "item-0",
      "item-1",
      "item-2",
      "item-3",
    ]);
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
        state: "delivered",
        at: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "routing-2",
        item: "item-1",
        target: { kind: "user" },
        state: "delivered",
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

describe("an item's routing summary", () => {
  async function routed(...records: readonly RoutingRecord[]) {
    const opened = pool();
    const record = capture({ id: "item-1" });
    await putDestinations(opened.pool, destination());
    await appendCapture(opened.pool, record);
    await opened.pool.transaction(async (tx) => {
      for (const each of records) await tx.insertRoutingRecord(each);
    });
    return { ...opened, record };
  }

  it("is absent for an item that has been nowhere", async () => {
    const { pool: p } = pool();
    const record = capture({ id: "item-1" });
    await appendCapture(p, record);

    expect((await p.item(record.id))?.routing).toBeUndefined();
  });

  it("counts the records, the pending ones, and where they went", async () => {
    const record = capture({ id: "item-1" });
    const { pool: p } = await routed(
      reserved(record, { id: "routing-1", at: "2026-08-03T10:00:00.000Z" }),
      markedProcessed(record, {
        id: "routing-2",
        at: "2026-08-03T11:00:00.000Z",
      }),
    );

    expect((await p.item(record.id))?.routing).toEqual({
      records: 2,
      pending: 1,
      to: [{ kind: "destination", destination: "vault" }, { kind: "user" }],
    });
  });

  it("names a destination once however many records reached it", async () => {
    const record = capture({ id: "item-1" });
    const { pool: p } = await routed(
      reserved(record, { id: "routing-1", at: "2026-08-03T10:00:00.000Z" }),
      reserved(record, {
        id: "routing-2",
        at: "2026-08-03T11:00:00.000Z",
        capability: "append-file",
      }),
    );

    expect((await p.item(record.id))?.routing).toEqual({
      records: 2,
      pending: 2,
      to: [{ kind: "destination", destination: "vault" }],
    });
  });

  it("goes away again when a cancelled reservation is removed", async () => {
    const record = capture({ id: "item-1" });
    const { pool: p } = await routed(reserved(record));

    await p.transaction((tx) =>
      tx.removeRoutingRecord(`routing-${record.id}` as RoutingRecordId),
    );

    expect((await p.item(record.id))?.routing).toBeUndefined();
  });

  it("reaches every row of a page, not only a read of one item", async () => {
    const { pool: p } = pool();
    await minutelyItems(p, 2);
    await p.transaction((tx) =>
      tx.insertRoutingRecord(markedProcessed(capture({ id: "item-0" }))),
    );

    const feed = await p.feed(ALL_OLDEST);
    expect(feed.values.map((item) => item.routing?.records)).toEqual([
      1,
      undefined,
    ]);
  });

  it("is on an archived item as much as on any other", async () => {
    const record = capture({ id: "item-1" });
    const { pool: p } = await routed(markedProcessed(record));
    await p.transaction((tx) =>
      tx.setArchiveState(record.id, {
        archivedAt: at("2026-08-03T12:00:00.000Z"),
      }),
    );

    const [archived] = (await p.archived(ALL_OLDEST)).values;
    expect(archived?.routing?.records).toBe(1);
  });
});

describe("the tags in use", () => {
  const PERSON: Agent = { kind: "person" };

  function tagged(id: string, names: readonly string[], addedAt: string) {
    return capture({
      id,
      tags: names.map((name) => ({ name, by: PERSON, addedAt })),
    });
  }

  it("answers nothing for a pool that has classified nothing", async () => {
    const { pool: p } = pool();
    await appendCapture(p, capture({ id: "item-1" }));

    expect(await p.tagsInUse()).toEqual([]);
  });

  it("counts the items carrying each tag, most used first", async () => {
    const { pool: p } = pool();
    await appendCapture(
      p,
      tagged("item-1", ["kind/quote", "project/a"], "2026-08-03T09:00:00.000Z"),
    );
    await appendCapture(
      p,
      tagged("item-2", ["kind/quote"], "2026-08-03T10:00:00.000Z"),
    );

    expect(await p.tagsInUse()).toEqual([
      { name: "kind/quote", items: 2 },
      { name: "project/a", items: 1 },
    ]);
  });

  /** Most used first is the order; the name is only what breaks a tie in it. */
  it("orders two tags of equal weight by name", async () => {
    const { pool: p } = pool();
    await appendCapture(
      p,
      tagged("item-1", ["project/b", "kind/quote"], "2026-08-03T09:00:00.000Z"),
    );

    expect((await p.tagsInUse()).map((use) => use.name)).toEqual([
      "kind/quote",
      "project/b",
    ]);
  });

  it("counts an item something was revised from, and the revision", async () => {
    const { pool: p } = pool();
    const original = tagged(
      "item-1",
      ["kind/quote"],
      "2026-08-03T09:00:00.000Z",
    );
    await appendCapture(p, original);
    await appendCapture(p, {
      ...revisionOf(original, {
        id: "item-2",
        text: "a second thought",
        at: "2026-08-03T10:00:00.000Z",
      }),
      tags: original.tags,
    });

    expect(await p.tagsInUse()).toEqual([{ name: "kind/quote", items: 2 }]);
  });

  it("counts an archived item, which is still in the pool", async () => {
    const { pool: p } = pool();
    await appendCapture(
      p,
      tagged("item-1", ["kind/quote"], "2026-08-03T09:00:00.000Z"),
    );
    await p.transaction((tx) =>
      tx.setArchiveState("item-1" as ItemId, {
        archivedAt: at("2026-08-03T12:00:00.000Z"),
      }),
    );

    expect((await p.tagsInUse())[0]?.items).toBe(1);
  });

  it("forgets a tag the last item carrying it lost", async () => {
    const { pool: p } = pool();
    await appendCapture(
      p,
      tagged("item-1", ["kind/quote"], "2026-08-03T09:00:00.000Z"),
    );
    await p.transaction((tx) =>
      tx.removeTag("item-1" as ItemId, "kind/quote" as TagName),
    );

    expect(await p.tagsInUse()).toEqual([]);
  });
});

describe("reservations", () => {
  const OLDEST_FIRST: OrderedPage = { limit: 50, order: "oldest-first" };

  async function reservedItem(overrides: { id?: string } = {}) {
    const opened = pool();
    const record = capture({ id: overrides.id ?? "item-1" });
    await putDestinations(opened.pool, destination());
    await appendCapture(opened.pool, record);
    const reservation = reserved(record);
    await opened.pool.transaction((tx) => tx.insertRoutingRecord(reservation));
    return { ...opened, record, reservation };
  }

  /**
   * It is the decision that processes an item, not the arrival: an item whose
   * delivery is still pending has left the queue.
   */
  it("keeps its item out of the queue although nothing has arrived", async () => {
    const { pool: p } = await reservedItem();

    expect((await p.queue(OLDEST_FIRST)).values).toEqual([]);
  });

  it("puts the item back when it is removed", async () => {
    const { pool: p, reservation } = await reservedItem();

    await p.transaction((tx) => tx.removeRoutingRecord(reservation.id));

    expect(ids((await p.queue(OLDEST_FIRST)).values)).toEqual(["item-1"]);
    expect(await p.routingRecords("item-1" as ItemId)).toEqual([]);
  });

  it("returns the item at its unchanged position", async () => {
    const { pool: p, reservation } = await reservedItem();
    await appendCapture(
      p,
      capture({ id: "item-2", createdAt: "2026-08-03T09:30:00.000Z" }),
    );

    await p.transaction((tx) => tx.removeRoutingRecord(reservation.id));

    expect(ids((await p.queue(OLDEST_FIRST)).values)).toEqual([
      "item-1",
      "item-2",
    ]);
  });

  it("becomes delivered, with wherever it landed", async () => {
    const { pool: p, reservation } = await reservedItem();

    await p.transaction((tx) =>
      tx.resolveRoutingRecord(reservation.id, {
        pointer: "vault/a-thought.md",
      }),
    );

    expect(await p.routingRecord(reservation.id)).toEqual({
      ...reservation,
      state: "delivered",
      pointer: "vault/a-thought.md",
    });
  });

  it("becomes delivered carrying the output and a link to it", async () => {
    const { pool: p, reservation } = await reservedItem();

    await p.transaction((tx) =>
      tx.resolveRoutingRecord(reservation.id, {
        pointer: "vault/a-thought.md",
        url: "https://vault.example/a-thought.md",
        output: {
          content: {
            blob: "sha256-abc" as BlobHash,
            mediaType: "text/markdown",
          },
          note: "the two pictures were not carried",
        },
      }),
    );

    expect(await p.routingRecord(reservation.id)).toEqual({
      ...reservation,
      state: "delivered",
      pointer: "vault/a-thought.md",
      url: "https://vault.example/a-thought.md",
      output: {
        content: { blob: "sha256-abc", mediaType: "text/markdown" },
        note: "the two pictures were not carried",
      },
    });
  });

  it("keeps a note about what could not be carried with no output content", async () => {
    const { pool: p, reservation } = await reservedItem();

    await p.transaction((tx) =>
      tx.resolveRoutingRecord(reservation.id, {
        output: { note: "posted, and nothing worth keeping came back" },
      }),
    );

    expect(await p.routingRecord(reservation.id)).toEqual({
      ...reservation,
      state: "delivered",
      output: { note: "posted, and nothing worth keeping came back" },
    });
  });

  it("answers nothing for a record no decision minted", async () => {
    const { pool: p } = pool();

    expect(await p.routingRecord("nobody" as RoutingRecordId)).toBeUndefined();
  });

  it("coexists with a second reservation of the same item", async () => {
    const { pool: p, record } = await reservedItem();
    const second = reserved(record, {
      id: "routing-2",
      at: "2026-08-03T10:30:00.000Z",
      capability: "append",
    });

    await p.transaction(async (tx) => {
      await tx.insertRoutingRecord(second);
      await tx.enqueue([
        deliveryJob(reserved(record), "job-1"),
        deliveryJob(second, "job-2"),
      ]);
    });

    expect((await p.routingRecords(record.id)).map((each) => each.id)).toEqual([
      "routing-item-1",
      "routing-2",
    ]);
    expect(
      (
        await p.claim(
          { kinds: ["delivery"], limit: 10, leaseFor: 60_000 as Duration },
          at("2026-08-03T12:00:00.000Z"),
        )
      ).map((lease) => lease.job.id),
    ).toEqual(["job-1", "job-2"]);
  });
});

describe("the unbuilt half of the store", () => {
  it("names the method it has not got to yet", async () => {
    const { pool: p } = pool();
    expect(() => p.tombstone("item-1" as ItemId)).toThrow(
      /tombstone is not implemented/,
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

describe("closing", () => {
  it("answers a second close rather than throwing at whoever asked twice", async () => {
    const { pool: p } = pool();

    await p.close();

    await expect(p.close()).resolves.toBeUndefined();
  });
});

describe("places a field has already held", () => {
  const ask = (p: SqlitePoolStore, field = "path") =>
    p.remembered({
      destination: "vault" as DestinationId,
      capability: "create-note" as CapabilityName,
      field,
    });

  /** One item per record: a record is item state and cascades with it. */
  async function held(
    ...records: readonly { at: string; path: string; state?: "pending" }[]
  ) {
    const opened = pool();
    await putDestinations(opened.pool, destination());

    const made: RoutingRecord[] = [];
    for (const [index, each] of records.entries()) {
      const item = capture({ id: `item-${index}` });
      await appendCapture(opened.pool, item);
      const record =
        each.state === "pending"
          ? reserved(item, {
              id: `routing-${index}`,
              at: each.at,
              arguments: { path: each.path },
            })
          : {
              ...reserved(item, {
                id: `routing-${index}`,
                at: each.at,
                arguments: { path: each.path },
              }),
              state: "delivered" as const,
            };
      made.push(record);
      await opened.pool.transaction((tx) => tx.insertRoutingRecord(record));
    }

    return { ...opened, records: made };
  }

  /**
   * `$.` and a bare name walks into a nested object where the name holds a dot,
   * and matches nothing where it holds a dash — which reads as a field nobody
   * has ever routed with rather than as a name the path could not express.
   */
  it("reads a field whose name a bare json path could not express", async () => {
    const opened = pool();
    await putDestinations(opened.pool, destination());

    const item = capture({ id: "item-0" });
    await appendCapture(opened.pool, item);
    await opened.pool.transaction((tx) =>
      tx.insertRoutingRecord({
        ...reserved(item, {
          id: "routing-0",
          arguments: { "board.column": "doing", "list-name": "today" },
        }),
        state: "delivered" as const,
      }),
    );

    expect((await ask(opened.pool, "board.column")).places).toEqual([
      {
        value: "doing",
        uses: 1,
        lastAt: at("2026-08-03T10:00:00.000Z"),
      },
    ]);
    expect(
      (await ask(opened.pool, "list-name")).places.map((each) => each.value),
    ).toEqual(["today"]);
  });

  it("counts the records that used each value, and when the last one was", async () => {
    const { pool: p } = await held(
      { at: "2026-08-03T10:00:00.000Z", path: "notes/a.md" },
      { at: "2026-08-03T11:00:00.000Z", path: "notes/a.md" },
      { at: "2026-08-03T12:00:00.000Z", path: "journal/b.md" },
    );

    expect(await ask(p)).toEqual({
      truncated: false,
      places: [
        { value: "notes/a.md", uses: 2, lastAt: "2026-08-03T11:00:00.000Z" },
        { value: "journal/b.md", uses: 1, lastAt: "2026-08-03T12:00:00.000Z" },
      ],
    });
  });

  it("answers nothing for a field no record's arguments carry", async () => {
    const { pool: p } = await held({
      at: "2026-08-03T10:00:00.000Z",
      path: "notes/a.md",
    });

    expect(await ask(p, "heading")).toEqual({ truncated: false, places: [] });
  });

  it("answers nothing for a capability nothing was routed with", async () => {
    const { pool: p } = await held({
      at: "2026-08-03T10:00:00.000Z",
      path: "notes/a.md",
    });

    expect(
      await p.remembered({
        destination: "vault" as DestinationId,
        capability: "post-to-board" as CapabilityName,
        field: "path",
      }),
    ).toEqual({ truncated: false, places: [] });
  });

  /**
   * A reservation still being retried is a place somebody is using. One that
   * was given up on is not, and that is the only reason this reaches the job.
   */
  it("counts a pending record whose delivery is still owed", async () => {
    const { pool: p, records } = await held({
      at: "2026-08-03T10:00:00.000Z",
      path: "notes/a.md",
      state: "pending",
    });
    const record = records[0];
    if (record === undefined) throw new Error("expected a record");
    await p.transaction((tx) => tx.enqueue([deliveryJob(record)]));

    expect((await ask(p)).places).toEqual([
      { value: "notes/a.md", uses: 1, lastAt: "2026-08-03T10:00:00.000Z" },
    ]);
  });

  it("drops a pending record whose delivery was abandoned", async () => {
    const { pool: p, records } = await held({
      at: "2026-08-03T10:00:00.000Z",
      path: "notes/a.md",
      state: "pending",
    });
    const record = records[0];
    if (record === undefined) throw new Error("expected a record");
    await p.transaction((tx) => tx.enqueue([deliveryJob(record)]));

    const [lease] = await p.claim(
      { kinds: ["delivery"], limit: 1, leaseFor: 60_000 as Duration },
      at("2026-08-03T10:00:30.000Z"),
    );
    if (lease === undefined) throw new Error("expected a lease");
    await p.transaction((tx) =>
      tx.resolveJob(lease.id, {
        kind: "abandoned",
        attempt: 1,
        abandonedAt: at("2026-08-03T10:01:00.000Z"),
        failure: { code: "rejected", detail: "no" },
      }),
    );

    expect((await ask(p)).places).toEqual([]);
  });

  it("keeps a delivered record whatever became of any job", async () => {
    const { pool: p } = await held({
      at: "2026-08-03T10:00:00.000Z",
      path: "notes/a.md",
    });

    expect((await ask(p)).places).toHaveLength(1);
  });

  it("says nothing for a destination nothing has ever named", async () => {
    const { pool: p } = pool();
    await putDestinations(p, destination());

    expect(await ask(p)).toEqual({ truncated: false, places: [] });
  });
});

describe("the sources in use", () => {
  it("counts what each captured, most recently captured first", async () => {
    const { pool: p } = pool();
    await appendCapture(
      p,
      capture({
        id: "item-1",
        source: SCRATCHPAD,
        createdAt: "2026-08-03T09:00:00.000Z",
      }),
    );
    await appendCapture(
      p,
      capture({
        id: "item-2",
        source: SCRATCHPAD,
        createdAt: "2026-08-03T11:00:00.000Z",
      }),
    );
    await appendCapture(
      p,
      capture({
        id: "item-3",
        source: "memos" as SourceId,
        createdAt: "2026-08-03T10:00:00.000Z",
      }),
    );

    expect(await p.sourcesInUse()).toEqual([
      {
        id: SCRATCHPAD,
        items: 2,
        lastCapturedAt: "2026-08-03T11:00:00.000Z",
      },
      { id: "memos", items: 1, lastCapturedAt: "2026-08-03T10:00:00.000Z" },
    ]);
  });

  /**
   * A source is discovered from the items it captured, so one whose items have
   * all gone is not a source the pool has anything to say about.
   */
  it("answers nothing at all for a pool holding no items", async () => {
    const { pool: p } = pool();

    expect(await p.sourcesInUse()).toEqual([]);
  });

  it("stops answering for a source whose every item was purged", async () => {
    const { pool: p, raw } = pool();
    await appendCapture(p, capture({ id: "item-1", source: SCRATCHPAD }));
    await appendCapture(
      p,
      capture({ id: "item-2", source: "memos" as SourceId }),
    );

    raw.prepare("DELETE FROM items WHERE source_id = ?").run("memos");

    expect((await p.sourcesInUse()).map((use) => use.id)).toEqual([SCRATCHPAD]);
  });

  it("orders by capture time, not by arrival", async () => {
    const { pool: p } = pool();
    await appendCapture(
      p,
      capture({
        id: "item-1",
        source: SCRATCHPAD,
        createdAt: "2026-08-03T11:00:00.000Z",
      }),
    );
    await appendCapture(
      p,
      capture({
        id: "item-2",
        source: "memos" as SourceId,
        createdAt: "2026-07-31T09:00:00.000Z",
      }),
    );

    expect((await p.sourcesInUse()).map((use) => use.id)).toEqual([
      SCRATCHPAD,
      "memos",
    ]);
  });
});
