import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Clock, Duration, Lease, Pool, Timestamp } from "@notemap/core";

import { startRunner } from "./runner";

const POLL = 5_000;

type Holding = {
  /** How much sooner than `due` the answer to `dueIn` has a timer fire. */
  readonly early?: number;
  /** How long a claim takes. */
  readonly slow?: number;
  /** A job claim passes over however due it is, as a mirror write behind another's lease. */
  readonly blocked?: boolean;
};

/**
 * A queue holding one job that becomes claimable at `due`, and nothing else:
 * enough of a pool to see when the runner asks for it.
 */
function holding(
  due: number,
  { early = 0, slow = 0, blocked = false }: Holding = {},
) {
  let taken = false;
  const claims: number[] = [];

  const pool = {
    work: {
      claim: () => {
        claims.push(Date.now());
        const takes = !taken && !blocked && Date.now() >= due;
        vi.setSystemTime(Date.now() + slow);
        if (!takes) return Promise.resolve([]);
        taken = true;
        return Promise.resolve([
          { id: "lease", job: { id: "job", kind: "delivery" } } as Lease,
        ]);
      },
      complete: () => Promise.resolve({ ok: true }),
      release: () => Promise.resolve({ ok: true }),
      dueIn: (_: unknown, since?: Timestamp) => {
        const after = since === undefined ? Date.now() : Date.parse(since);
        return Promise.resolve(
          taken || due <= after
            ? undefined
            : (Math.max(due - Date.now() - early, 0) as Duration),
        );
      },
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
const CLOCK: Clock = { now: () => new Date().toISOString() as Timestamp };

/** A fired template's window ends between two polls; the delivery should not wait for the second. */
it("claims a job as it comes due rather than on the poll after it", async () => {
  const queue = holding(POLL + 1_200);
  const perform = vi.fn(() => Promise.resolve({ kind: "succeeded" } as never));
  const runner = startRunner(queue.pool, ["delivery"], perform, CONFIG, CLOCK);

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
    CLOCK,
  );

  await vi.advanceTimersByTimeAsync(POLL * 2);
  expect(queue.claims).toEqual([POLL, POLL * 2]);

  await runner.stop();
});

/** A window shorter than the poll: no pass would see the job before it is due. */
it("claims a job made between polls as it comes due, once woken", async () => {
  const queue = holding(1_000);
  const runner = startRunner(
    queue.pool,
    ["delivery"],
    () => Promise.resolve({ kind: "succeeded" } as never),
    CONFIG,
    CLOCK,
  );

  runner.wake();
  await vi.advanceTimersByTimeAsync(999);
  expect(queue.taken()).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(queue.taken()).toBe(true);
  // Nothing asked before it was due, and nothing after but the pass that took it.
  expect(new Set(queue.claims)).toEqual(new Set([1_000]));

  await runner.stop();
});

it("takes a job its timer woke a moment too early for, without waiting for the poll", async () => {
  const queue = holding(1_000, { early: 5, slow: 5 });
  const runner = startRunner(
    queue.pool,
    ["delivery"],
    () => Promise.resolve({ kind: "succeeded" } as never),
    CONFIG,
    CLOCK,
  );

  runner.wake();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(queue.taken()).toBe(true);
  expect(queue.claims).toEqual([995, 1_001, 1_006]);

  await runner.stop();
});

it("looks once more for a job a claim passed over, and then leaves it to the poll", async () => {
  const queue = holding(1_000, { early: 5, slow: 5, blocked: true });
  const runner = startRunner(
    queue.pool,
    ["delivery"],
    () => Promise.resolve({ kind: "succeeded" } as never),
    CONFIG,
    CLOCK,
  );

  runner.wake();
  await vi.advanceTimersByTimeAsync(POLL - 1);
  expect(queue.claims).toEqual([995, 1_001]);

  await runner.stop();
});

it("keeps a sooner timer when a later wake answers a later job", async () => {
  const claims: number[] = [];
  const answers = [1_000, 3_000];
  const pool = {
    work: {
      claim: () => {
        claims.push(Date.now());
        return Promise.resolve([]);
      },
      dueIn: () => Promise.resolve(answers.shift() as Duration | undefined),
    },
  } as unknown as Pool;
  const runner = startRunner(
    pool,
    ["delivery"],
    () => Promise.resolve({ kind: "succeeded" } as never),
    CONFIG,
    CLOCK,
  );

  runner.wake();
  runner.wake();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(claims).toEqual([1_000]);

  await runner.stop();
});

it("asks what came due since its last claim, read from the pool's clock", async () => {
  const asked: (Timestamp | undefined)[] = [];
  const pool = {
    work: {
      claim: () => Promise.resolve([]),
      dueIn: (_: unknown, since?: Timestamp) => {
        asked.push(since);
        return Promise.resolve(undefined);
      },
    },
  } as unknown as Pool;
  const clock: Clock = { now: () => "2026-08-03T09:00:00.000Z" as Timestamp };
  const runner = startRunner(
    pool,
    ["delivery"],
    () => Promise.resolve({ kind: "succeeded" } as never),
    CONFIG,
    clock,
  );

  await runner.drain();
  await vi.advanceTimersByTimeAsync(0);
  expect(asked).toEqual(["2026-08-03T09:00:00.000Z"]);

  await runner.stop();
});
