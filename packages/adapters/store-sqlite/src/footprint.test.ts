import { afterEach, describe, expect, it } from "vitest";

import type { AssetId } from "@notemap/core";

import { createSqlitePoolStore } from "./pool-store";
import { appendCapture, asset, capture, store } from "./testing/fixture";

const opened: { cleanup: () => Promise<void> }[] = [];

afterEach(async () => {
  for (const each of opened.splice(0)) await each.cleanup();
});

function held() {
  const one = store();
  opened.push(one);
  return one;
}

describe("how much the store says it holds", () => {
  it("rises as captures are written", async () => {
    const { pool } = held();
    const before = await pool.footprint();

    for (let each = 0; each < 200; each += 1) {
      await appendCapture(pool, capture({ id: `item-${each}` }));
    }

    expect((await pool.footprint()).bytes).toBeGreaterThan(before.bytes);
  });

  /** The pragma cannot see a `-wal` of tens of megabytes, so the driver adds it. */
  it("counts what the database keeps beside its own file", async () => {
    const one = held();
    await appendCapture(one.pool, capture());

    const pages = one.raw.prepare("PRAGMA page_count").get() as {
      page_count: number;
    };
    const size = one.raw.prepare("PRAGMA page_size").get() as {
      page_size: number;
    };

    expect((await one.pool.footprint()).bytes).toBeGreaterThan(
      pages.page_count * size.page_size,
    );
  });

  /** No path to stat, and nothing beside it: the pages are the whole answer. */
  it("answers for a store with no file at all", async () => {
    const pool = createSqlitePoolStore({ file: ":memory:" });
    try {
      const { bytes, unused } = await pool.footprint();

      expect(bytes).toBeGreaterThan(0);
      expect(unused).toBeLessThan(bytes);
    } finally {
      await pool.close();
    }
  });

  /** Why a pool that lost a few hundred assets did not shrink. */
  it("says how much it holds and is not using, once rows are released", async () => {
    const { pool } = held();
    const assets = Array.from(
      { length: 2000 },
      (_, each) => `asset-${each}` as AssetId,
    );

    await pool.transaction(async (tx) => {
      for (const id of assets) {
        await tx.insertAsset(asset({ id, blob: `blob-${id}` }));
      }
    });
    expect((await pool.footprint()).unused).toBe(0);

    await pool.transaction((tx) => tx.deleteAssets(assets));

    expect((await pool.footprint()).unused).toBeGreaterThan(0);
  });
});
