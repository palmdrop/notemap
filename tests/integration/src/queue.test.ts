import type { Item, ItemId, Page, Pool, RoutingRecord } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  drainWith,
  envelope,
  harness,
  storedRecords,
  type Harness,
  type Mirroring,
} from "./fixture";

const ALL: Page = { limit: 50 };

const open: Harness[] = [];

function pool(mirroring: Mirroring = "stub"): Harness {
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

/** Narrows a mutation the test asserts should have succeeded. */
function succeeded<T>(
  result: { kind: "ok"; value: T } | { kind: "refused"; refusal: unknown },
): T {
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value;
}

const ids = (values: readonly Item[]) => values.map((item) => item.id);

/** Three captures a minute apart, oldest first, named by their order. */
async function three(p: Pool): Promise<[ItemId, ItemId, ItemId]> {
  const items: ItemId[] = [];
  for (let index = 0; index < 3; index += 1) {
    const item = captured(
      await p.capture(
        envelope({
          id: `item-${index}`,
          sourceItemId: `src-${index}`,
          capturedAt: `2026-08-06T09:0${index}:00.000Z`,
        }),
      ),
    );
    items.push(item.id);
  }
  return items as [ItemId, ItemId, ItemId];
}

describe("archiving", () => {
  it("takes an item out of the queue and puts it in the archive", async () => {
    const { pool: p } = pool();
    const [, second] = await three(p);

    const archived = succeeded(await p.items.archive(second, "noise"));

    expect(archived.archived?.reason).toBe("noise");
    expect(ids((await p.views.queue(ALL)).values)).toEqual([
      "item-0",
      "item-2",
    ]);
    expect(ids((await p.views.archived(ALL)).values)).toEqual(["item-1"]);
  });

  it("leaves the item in the feed, since nothing was deleted", async () => {
    const { pool: p } = pool();
    const [first] = await three(p);

    await p.items.archive(first);

    expect(
      ids((await p.views.feed({ limit: 50, order: "oldest-first" })).values),
    ).toEqual(["item-0", "item-1", "item-2"]);
  });

  it("returns an unarchived item to its original position", async () => {
    const { pool: p } = pool();
    const [, second] = await three(p);
    const before = ids((await p.views.queue(ALL)).values);

    await p.items.archive(second);
    const restored = succeeded(await p.items.unarchive(second));

    expect(restored.archived).toBeUndefined();
    expect(ids((await p.views.queue(ALL)).values)).toEqual(before);
    expect((await p.views.archived(ALL)).values).toEqual([]);
  });

  it("refuses to archive an item that is already archived, and changes nothing", async () => {
    const { pool: p } = pool();
    const [first] = await three(p);
    await p.items.archive(first, "the first reason");

    const again = await p.items.archive(first, "the second reason");

    expect(again).toMatchObject({
      kind: "refused",
      refusal: { kind: "already-archived", item: first },
    });
    expect((await p.items.get(first))?.archived?.reason).toBe(
      "the first reason",
    );
  });

  it("refuses to unarchive an item that is not archived", async () => {
    const { pool: p } = pool();
    const [first] = await three(p);

    expect(await p.items.unarchive(first)).toMatchObject({
      kind: "refused",
      refusal: { kind: "not-archived", item: first },
    });
  });

  it("refuses an id no item has, either way round", async () => {
    const { pool: p } = pool();
    const missing = "nobody" as ItemId;

    expect(await p.items.archive(missing)).toMatchObject({
      kind: "refused",
      refusal: { kind: "no-such-item", item: missing },
    });
    expect(await p.items.unarchive(missing)).toMatchObject({
      kind: "refused",
      refusal: { kind: "no-such-item", item: missing },
    });
  });

  it("records both halves in the log, by an anonymous person", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const [first] = await three(p);

    await p.items.archive(first, "noise");
    // The clock moves, or the two entries share an instant and the log's
    // tie-break on id is what these ids happen to spell.
    opened.clock.set("2026-08-06T10:00:00.000Z");
    await p.items.unarchive(first);

    const logged = await p.actions.forItem(first, {
      limit: 50,
      order: "oldest-first",
    });
    expect(logged.values.map((action) => action.kind)).toEqual([
      "captured",
      "archived",
      "unarchived",
    ]);
    expect(logged.values[1]).toMatchObject({
      by: { kind: "person" },
      detail: { reason: "noise" },
    });
  });
});

describe("marking an item processed", () => {
  const records = (values: readonly RoutingRecord[]) =>
    values.map((record) => record.target);

  it("appends a routing record naming the user, and drains the queue", async () => {
    const { pool: p } = pool();
    const [first] = await three(p);

    const record = succeeded(
      await p.routing.markProcessed(first, "pasted into the vault"),
    );

    expect(record.item).toBe(first);
    expect(record.target).toEqual({
      kind: "user",
      note: "pasted into the vault",
    });
    expect(ids((await p.views.queue(ALL)).values)).toEqual([
      "item-1",
      "item-2",
    ]);
    expect(await p.routing.recordsFor(first)).toEqual([record]);
  });

  it("leaves the item in the feed, unarchived", async () => {
    const { pool: p } = pool();
    const [first] = await three(p);

    await p.routing.markProcessed(first);

    const item = await p.items.get(first);
    expect(item?.archived).toBeUndefined();
    expect((await p.views.archived(ALL)).values).toEqual([]);
  });

  it("appends a second record rather than refusing, and the item stays processed", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const [first] = await three(p);

    await p.routing.markProcessed(first, "first");
    opened.clock.set("2026-08-06T10:00:00.000Z");
    await p.routing.markProcessed(first, "second");

    expect(records(await p.routing.recordsFor(first))).toEqual([
      { kind: "user", note: "first" },
      { kind: "user", note: "second" },
    ]);
    expect(ids((await p.views.queue(ALL)).values)).toEqual([
      "item-1",
      "item-2",
    ]);
  });

  it("works from the archive, which is a filter rather than a terminus", async () => {
    const { pool: p } = pool();
    const [first] = await three(p);
    await p.items.archive(first);

    const record = succeeded(await p.routing.markProcessed(first));

    expect(await p.routing.recordsFor(first)).toEqual([record]);
    expect(ids((await p.views.archived(ALL)).values)).toEqual(["item-0"]);
  });

  it("refuses an id no item has", async () => {
    const { pool: p } = pool();

    expect(await p.routing.markProcessed("nobody" as ItemId)).toMatchObject({
      kind: "refused",
      refusal: { kind: "no-such-item", item: "nobody" },
    });
  });

  it("records the routing in the log, by an anonymous person", async () => {
    const { pool: p } = pool();
    const [first] = await three(p);

    const record = succeeded(await p.routing.markProcessed(first));

    const logged = await p.actions.forItem(first, {
      limit: 50,
      order: "newest-first",
    });
    expect(logged.values[0]).toMatchObject({
      kind: "routed",
      by: { kind: "person" },
      detail: { record: record.id, target: "user" },
    });
  });
});

describe("what the mirror is owed", () => {
  it("carries the routing record of a marked item", async () => {
    const harnessed = pool("filesystem");
    const [first] = await three(harnessed.pool);
    const drain = drainWith(harnessed);
    await drain();

    const record = succeeded(
      await harnessed.pool.routing.markProcessed(first, "into the vault"),
    );
    await drain();

    const mirrored = await harnessed.pool.mirror.recordFor(first);
    expect(mirrored?.routing).toEqual([record]);
  });

  it("carries the archive state of an archived item", async () => {
    const harnessed = pool("filesystem");
    const [first] = await three(harnessed.pool);
    const drain = drainWith(harnessed);
    await drain();

    await harnessed.pool.items.archive(first, "noise");
    expect(await drain()).toBe(1);

    const mirrored = await harnessed.pool.mirror.recordFor(first);
    expect(mirrored?.item.archived?.reason).toBe("noise");
  });

  it("owes nothing when no writer is wired", async () => {
    const harnessed = pool("off");
    const [first] = await three(harnessed.pool);

    await harnessed.pool.items.archive(first);
    await harnessed.pool.routing.markProcessed(first);

    expect(await drainWith(harnessed)()).toBe(0);
  });
});

describe("draining a queue end to end", () => {
  it("leaves one item queued and a mirror agreeing with the pool", async () => {
    const harnessed = pool("filesystem");
    const { pool: p } = harnessed;
    const [archived, processed, left] = await three(p);

    await p.items.archive(archived, "noise");
    await p.routing.markProcessed(processed, "into the fiction-a vault");
    await drainWith(harnessed)();

    expect(ids((await p.views.queue(ALL)).values)).toEqual([left]);
    expect(ids((await p.views.archived(ALL)).values)).toEqual([archived]);

    const mirrored = await storedRecords(harnessed.mirrorRoot);
    expect([...mirrored.keys()].sort()).toEqual(
      [archived, processed, left].sort(),
    );
    for (const [id, record] of mirrored) {
      expect(record, id).toEqual(await p.mirror.recordFor(id));
    }

    expect(mirrored.get(archived)?.item.archived?.reason).toBe("noise");
    expect(mirrored.get(processed)?.routing).toEqual(
      await p.routing.recordsFor(processed),
    );
    expect(mirrored.get(left)?.routing).toEqual([]);
  });
});

describe("the queue under a reader", () => {
  it("neither skips nor repeats a row as items leave it", async () => {
    const { pool: p } = pool();
    const [, second] = await three(p);

    const page: Page = { limit: 1 };
    const first = await p.views.queue(page);
    await p.items.archive(second);

    if (first.next === undefined) throw new Error("expected another page");
    const rest = await p.views.queue({ ...page, after: first.next });

    expect([...ids(first.values), ...ids(rest.values)]).toEqual([
      "item-0",
      "item-2",
    ]);
    expect(rest.next).toBeUndefined();
  });
});
