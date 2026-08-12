import { describe, expect, it } from "vitest";

import type { AssetId, Pool } from "@notemap/core";

import { startSweeper } from "./sweeper";

/** Counts the sweeps it is asked for, and answers when a test lets it. */
function stubPool(): {
  pool: Pool;
  runs: () => number;
  finish: (assets: readonly AssetId[]) => void;
} {
  let count = 0;
  let release: ((assets: readonly AssetId[]) => void) | undefined;

  const pool = {
    maintenance: {
      sweepUnreferencedAssets: () => {
        count += 1;
        return new Promise<readonly AssetId[]>((resolve) => {
          release = resolve;
        });
      },
    },
  } as unknown as Pool;

  return {
    pool,
    runs: () => count,
    finish: (assets) => release?.(assets),
  };
}

const NEVER_POLLS = 60 * 60 * 1000;

describe("the sweeper", () => {
  it("takes nothing once it has been stopped", async () => {
    const stub = stubPool();
    const sweeper = startSweeper(stub.pool, { intervalMs: NEVER_POLLS });

    await sweeper.stop();
    expect(await sweeper.run()).toEqual([]);
    expect(stub.runs()).toBe(0);
  });

  it("skips a run that overlaps one already in flight", async () => {
    const stub = stubPool();
    const sweeper = startSweeper(stub.pool, { intervalMs: NEVER_POLLS });

    const first = sweeper.run();
    const second = sweeper.run();
    stub.finish(["asset-1" as AssetId]);

    expect(await first).toEqual(["asset-1"]);
    expect(await second).toEqual(["asset-1"]);
    expect(stub.runs()).toBe(1);

    await sweeper.stop();
  });
});
