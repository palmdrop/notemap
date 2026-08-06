import { describe, expect, it } from "vitest";

import type {
  Item,
  ItemId,
  PageCursor,
  Pool,
  Slice,
  Timestamp,
} from "../types";
import { timestamp } from "../testing/brands";
import {
  createTestPool,
  expectCaptured,
  expectOk,
  morningAt,
  textCapture,
} from "../testing/pool-fixture";

async function capture(
  pool: Pool,
  capturedAt: Timestamp,
  text: string,
): Promise<Item> {
  const envelope = textCapture({ capturedAt, text });
  return expectCaptured(expectOk(await pool.capture(envelope)));
}

async function captureThroughTheMorning(
  pool: Pool,
  minutes: readonly number[],
): Promise<readonly Item[]> {
  const captured: Item[] = [];
  for (const minute of minutes) {
    captured.push(await capture(pool, morningAt(minute), `thought ${minute}`));
  }
  return captured;
}

function ids(items: readonly Item[]): readonly ItemId[] {
  return items.map((item) => item.id);
}

function cursorOf(slice: Slice<Item>): PageCursor {
  if (slice.next === undefined) {
    expect.unreachable("expected the feed to offer a further page");
  }
  return slice.next;
}

// Skipped until the store slice lands and a Pool can be wired over it.
describe.skip("the feed", () => {
  it("places a capture where its source says it happened, not at the end", async () => {
    const pool = createTestPool();

    const morning = await capture(pool, morningAt(10), "written this morning");
    const later = await capture(pool, morningAt(20), "written an hour later");
    const offline = await capture(
      pool,
      timestamp("2026-07-31T09:15:00Z"),
      "written offline, synced three days later",
    );

    const feed = await pool.views.feed({ limit: 10 });

    expect(ids(feed.values)).toEqual([offline.id, morning.id, later.id]);
  });

  it("holds every item that was captured", async () => {
    const pool = createTestPool();
    const captured = await captureThroughTheMorning(pool, [1, 2, 3, 4, 5]);

    const feed = await pool.views.feed({ limit: 10 });

    expect(ids(feed.values)).toEqual(ids(captured));
    expect(feed.next).toBeUndefined();
  });

  it("continues from its cursor without repeating or skipping an item", async () => {
    const pool = createTestPool();
    const captured = await captureThroughTheMorning(pool, [1, 2, 3, 4, 5]);

    const first = await pool.views.feed({ limit: 2 });
    expect(ids(first.values)).toEqual(ids(captured.slice(0, 2)));

    const second = await pool.views.feed({ limit: 2, after: cursorOf(first) });
    expect(ids(second.values)).toEqual(ids(captured.slice(2, 4)));

    const third = await pool.views.feed({ limit: 2, after: cursorOf(second) });
    expect(ids(third.values)).toEqual(ids(captured.slice(4)));
    expect(third.next).toBeUndefined();
  });

  it("keeps a cursor usable after further captures arrive", async () => {
    const pool = createTestPool();
    const captured = await captureThroughTheMorning(pool, [1, 2, 3, 4]);

    const first = await pool.views.feed({ limit: 2 });
    const cursor = cursorOf(first);
    await capture(pool, morningAt(50), "captured while the caller was reading");

    const second = await pool.views.feed({ limit: 2, after: cursor });

    expect(ids(second.values)).toEqual(ids(captured.slice(2, 4)));
    for (const item of second.values) {
      expect(ids(first.values)).not.toContain(item.id);
    }
  });
});
