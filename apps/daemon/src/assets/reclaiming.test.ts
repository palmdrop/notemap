import { describe, expect, it } from "vitest";

import type { Pool, ReclaimOutcome } from "@notemap/core";

import { startReclaiming } from "./reclaiming";

/** Counts the reclaims it is asked for, and answers when a test lets it or the signal says stop. */
function stubPool(): {
  pool: Pool;
  runs: () => number;
  signal: () => AbortSignal | undefined;
  finish: (blobs: number) => void;
} {
  let count = 0;
  let given: AbortSignal | undefined;
  let release: ((took: ReclaimOutcome) => void) | undefined;

  const pool = {
    maintenance: {
      reclaimUnnamedBlobs: (signal?: AbortSignal) => {
        count += 1;
        given = signal;
        return new Promise<ReclaimOutcome>((resolve) => {
          release = resolve;
          signal?.addEventListener("abort", () =>
            resolve({ blobs: 0, bytes: 0 }),
          );
        });
      },
    },
  } as unknown as Pool;

  return {
    pool,
    runs: () => count,
    signal: () => given,
    finish: (blobs) => release?.({ blobs, bytes: blobs * 10 }),
  };
}

const NEVER_POLLS = 60 * 60 * 1000;

describe("reclaiming", () => {
  it("starts a run as the host starts, without being waited on", async () => {
    const stub = stubPool();
    const reclaiming = startReclaiming(stub.pool, {
      reclaimIntervalMs: NEVER_POLLS,
    });

    expect(stub.runs()).toBe(1);
    await reclaiming.stop();
  });

  it("skips a run that overlaps one already in flight", async () => {
    const stub = stubPool();
    const reclaiming = startReclaiming(stub.pool, {
      reclaimIntervalMs: NEVER_POLLS,
    });

    const again = reclaiming.run();
    stub.finish(2);

    expect(await again).toEqual({ blobs: 2, bytes: 20 });
    expect(stub.runs()).toBe(1);
    await reclaiming.stop();
  });

  it("lets go of the run in flight when stopped, waits for it, and starts no other", async () => {
    const stub = stubPool();
    const reclaiming = startReclaiming(stub.pool, {
      reclaimIntervalMs: NEVER_POLLS,
    });

    await reclaiming.stop();

    expect(stub.signal()?.aborted).toBe(true);
    expect(await reclaiming.run()).toEqual({ blobs: 0, bytes: 0 });
    expect(stub.runs()).toBe(1);
  });
});
