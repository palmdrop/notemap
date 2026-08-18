import type { Duration, Page } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { envelope, harness, type Harness } from "./fixture";

const ALL: Page = { limit: 50 };
const MINUTE = 60_000 as Duration;

const open: Harness[] = [];

function pool(...args: Parameters<typeof harness>): Harness {
  const opened = harness(...args);
  open.push(opened);
  return opened;
}

function also(opened: Harness): Harness {
  open.push(opened);
  return opened;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

describe("a pool opened again over the same files", () => {
  it("holds what the last one captured", async () => {
    const first = pool();
    await first.pool.capture(envelope({ id: "item-1" }));
    await first.pool.capture(envelope({ id: "item-2", sourceItemId: "src-2" }));

    const again = also(await first.reopen());

    const feed = await again.pool.views.feed(ALL);

    expect(feed.values.map((item) => item.id)).toEqual(["item-2", "item-1"]);
  });

  it("still owes the work the last one never did", async () => {
    const first = pool();
    await first.pool.capture(envelope({ id: "item-1" }));

    const again = also(await first.reopen());
    const claimed = await again.pool.work.claim({
      kinds: ["mirror"],
      limit: 16,
      leaseFor: MINUTE,
    });

    expect(claimed.map((lease) => lease.job.subject)).toEqual([
      { kind: "item", item: "item-1" },
    ]);
  });

  it("takes back a lease the last one died holding, once it has run out", async () => {
    const first = pool();
    await first.pool.capture(envelope({ id: "item-1" }));
    await first.pool.work.claim({
      kinds: ["mirror"],
      limit: 16,
      leaseFor: MINUTE,
    });

    // The host went while it held the lease, which is what a restart looks like
    // from the pool's side: nothing was reported and nothing was released.
    const again = also(await first.reopen());
    expect(
      await again.pool.work.claim({
        kinds: ["mirror"],
        limit: 16,
        leaseFor: MINUTE,
      }),
    ).toEqual([]);

    again.clock.set("2026-08-06T09:02:00.000Z");
    const retaken = await again.pool.work.claim({
      kinds: ["mirror"],
      limit: 16,
      leaseFor: MINUTE,
    });

    expect(retaken.map((lease) => lease.job.subject)).toEqual([
      { kind: "item", item: "item-1" },
    ]);
  });
});

describe("two claimants over one pool", () => {
  it("never hands the same job to both", async () => {
    const opened = pool();
    await opened.pool.capture(envelope({ id: "item-1" }));
    await opened.pool.capture(
      envelope({ id: "item-2", sourceItemId: "src-2" }),
    );

    const [first, second] = await Promise.all([
      opened.pool.work.claim({
        kinds: ["mirror"],
        limit: 16,
        leaseFor: MINUTE,
      }),
      opened.pool.work.claim({
        kinds: ["mirror"],
        limit: 16,
        leaseFor: MINUTE,
      }),
    ]);

    const claimed = [...first, ...second].map((lease) => lease.job.id);
    expect(claimed).toHaveLength(2);
    expect(new Set(claimed).size).toBe(2);
  });
});
