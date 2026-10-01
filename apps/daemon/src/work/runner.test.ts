import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Lease, Pool, Timestamp } from "@notemap/core";

import { startRunner } from "./runner";

const POLL = 5_000;

/**
 * A queue holding one job that becomes claimable at `due`, and nothing else:
 * enough of a pool to see when the runner asks for it.
 */
function holding(due: number) {
  let taken = false;
  const claims: number[] = [];

  const pool = {
    work: {
      claim: () => {
        claims.push(Date.now());
        if (taken || Date.now() < due) return Promise.resolve([]);
        taken = true;
        return Promise.resolve([
          { id: "lease", job: { id: "job", kind: "delivery" } } as Lease,
        ]);
      },
      complete: () => Promise.resolve({ ok: true }),
      release: () => Promise.resolve({ ok: true }),
      nextDue: () =>
        Promise.resolve(
          taken || Date.now() >= due
            ? undefined
            : (new Date(due).toISOString() as Timestamp),
        ),
    },
  } as unknown as Pool;

  return { pool, claims, taken: () => taken };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

const CONFIG = { pollIntervalMs: POLL, leaseForMs: 60_000, batch: 4 } as never;

/** A fired template's window ends between two polls; the delivery should not wait for the second. */
it("claims a job as it comes due rather than on the poll after it", async () => {
  const queue = holding(POLL + 1_200);
  const perform = vi.fn(() => Promise.resolve({ kind: "succeeded" } as never));
  const runner = startRunner(queue.pool, ["delivery"], perform, CONFIG);

  await vi.advanceTimersByTimeAsync(POLL);
  expect(queue.taken()).toBe(false);

  await vi.advanceTimersByTimeAsync(1_200);
  expect(queue.taken()).toBe(true);
  expect(perform).toHaveBeenCalledOnce();

  await runner.stop();
});

it("leaves a job due after the next poll to that poll", async () => {
  const queue = holding(POLL * 3);
  const runner = startRunner(
    queue.pool,
    ["delivery"],
    () => Promise.resolve({ kind: "succeeded" } as never),
    CONFIG,
  );

  await vi.advanceTimersByTimeAsync(POLL * 2);
  expect(queue.claims).toEqual([POLL, POLL * 2]);

  await runner.stop();
});
