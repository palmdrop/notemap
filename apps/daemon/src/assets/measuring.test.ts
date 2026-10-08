import { describe, expect, it } from "vitest";

import type { Pool } from "@notemap/core";

import { startMeasuring } from "./measuring";

/** Hands the run's signal to the test, and answers when the signal says stop. */
function stubPool(): { pool: Pool; signal: () => AbortSignal | undefined } {
  let given: AbortSignal | undefined;

  const pool = {
    maintenance: {
      measurePictures: (signal?: AbortSignal) => {
        given = signal;
        return new Promise<number>((resolve) => {
          signal?.addEventListener("abort", () => resolve(3));
        });
      },
    },
  } as unknown as Pool;

  return { pool, signal: () => given };
}

describe("measuring as the host starts", () => {
  it("starts at once, and stopping lets go of the run and waits for it", async () => {
    const stub = stubPool();
    const measuring = startMeasuring(stub.pool);

    expect(stub.signal()?.aborted).toBe(false);
    await measuring.stop();
    expect(stub.signal()?.aborted).toBe(true);
  });

  it("swallows a run that throws, so stopping still resolves", async () => {
    const pool = {
      maintenance: {
        measurePictures: () => Promise.reject(new Error("the disk went")),
      },
    } as unknown as Pool;

    await expect(startMeasuring(pool).stop()).resolves.toBeUndefined();
  });
});
