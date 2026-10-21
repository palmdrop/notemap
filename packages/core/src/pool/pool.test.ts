import { describe, expect, it } from "vitest";

import type { PoolConfig } from "#types/api/config";
import type { PoolPorts, PoolStore } from "#types/api/ports";
import type { ItemId } from "#types/domain/ids";
import type { FeedPage, OrderedPage } from "#types/result";

import { createPool } from "./pool";

const CONFIG = { payloadTypes: [] } as unknown as PoolConfig;

function poolOverStore(store: Partial<PoolStore>) {
  return createPool(CONFIG, { store } as unknown as PoolPorts);
}

describe("the pool's views", () => {
  it("reads the feed newest first unless the page says otherwise", async () => {
    const seen: OrderedPage[] = [];
    const pool = poolOverStore({
      feed: (page) => {
        seen.push(page as OrderedPage);
        return Promise.resolve({ values: [] });
      },
    });

    await pool.views.feed({ limit: 10 });
    await pool.views.feed({ limit: 10, order: "oldest-first" });

    expect(seen.map((page) => page.order)).toEqual([
      "newest-first",
      "oldest-first",
    ]);
  });

  it("reads the feed by capture time unless the page names processed", async () => {
    const seen: FeedPage[] = [];
    const pool = poolOverStore({
      feed: (page) => {
        seen.push(page);
        return Promise.resolve({ values: [] });
      },
    });

    await pool.views.feed({ limit: 10 });
    await pool.views.feed({ limit: 10, by: "processed" });

    expect(seen.map((page) => page.by)).toEqual(["capture", "processed"]);
  });

  it("reads the queue oldest first unless the page says otherwise, which is the only way it differs from the feed", async () => {
    const seen: OrderedPage[] = [];
    const pool = poolOverStore({
      queue: (page) => {
        seen.push(page as OrderedPage);
        return Promise.resolve({ values: [] });
      },
    });

    await pool.views.queue({ limit: 10 });
    await pool.views.queue({ limit: 10, order: "newest-first" });

    expect(seen.map((page) => page.order)).toEqual([
      "oldest-first",
      "newest-first",
    ]);
  });

  it("reads the archive oldest first unless the page says otherwise", async () => {
    const seen: OrderedPage[] = [];
    const pool = poolOverStore({
      archived: (page) => {
        seen.push(page as OrderedPage);
        return Promise.resolve({ values: [] });
      },
    });

    await pool.views.archived({ limit: 10 });

    expect(seen[0]?.order).toBe("oldest-first");
  });
});

describe("a method whose slice is not built yet", () => {
  it("throws naming which call it was, rather than doing nothing", () => {
    const pool = poolOverStore({});

    expect(() => pool.items.purge("item-1" as ItemId)).toThrow(
      "core: items.purge is not implemented yet",
    );
    expect(() => pool.actions.clear()).toThrow(
      "core: actions.clear is not implemented yet",
    );
  });
});
