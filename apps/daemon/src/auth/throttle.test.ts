import type { Clock, Timestamp } from "@notemap/core";
import { describe, expect, it } from "vitest";

import { createLoginThrottle, type Throttle } from "./throttle";

const START = "2026-08-31T09:00:00.000Z";

function frozenClock(start = START): Clock & { pass: (ms: number) => void } {
  let current = Date.parse(start);
  return {
    now: () => new Date(current).toISOString() as Timestamp,
    pass: (ms) => {
      current += ms;
    },
  };
}

const throttle = (clock: Clock) => createLoginThrottle({ clock });

/** One wrong guess, and what the door said. `0` is the door letting it in. */
const guess = (it: Throttle): number => {
  const attempt = it.begin();
  if (!attempt.allowed) return attempt.wait;

  attempt.settle(false);
  return 0;
};

const guessing = (it: Throttle, count: number): number[] =>
  Array.from({ length: count }, () => guess(it));

const letIn = (count: number) => Array.from({ length: count }, () => 0);

describe("what the login throttle allows", () => {
  it("lets a person mistype a few times without punishing them", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    expect(guessing(it, 6)).toEqual(letIn(6));
  });

  it("closes the door on the attempt after that", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    guessing(it, 6);

    expect(guess(it)).toBe(1_000);
  });

  it("doubles the wait with every further attempt", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    guessing(it, 6);

    let wait = 1_000;
    expect(guess(it)).toBe(wait);

    for (const doubled of [2_000, 4_000, 8_000, 16_000]) {
      clock.pass(wait);

      expect(guess(it)).toBe(0);
      expect(guess(it)).toBe(doubled);

      wait = doubled;
    }
  });

  /** Bounded on purpose: an unbounded wait is a lock, and a lock is a denial. */
  it("stops doubling at half a minute, however long it goes on", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    for (let attempt = 0; attempt < 40; attempt += 1) {
      clock.pass(60_000);
      guess(it);
    }

    expect(guess(it)).toBe(30_000);
  });

  it("opens again as the wait passes", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    guessing(it, 6);
    clock.pass(999);
    expect(guess(it)).toBe(1);

    clock.pass(1);
    expect(guess(it)).toBe(0);
  });
});

describe("what clears the count", () => {
  it("a sign-in that worked", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    guessing(it, 10);
    expect(guess(it)).toBeGreaterThan(0);

    clock.pass(60_000);
    const worked = it.begin();
    if (!worked.allowed) throw new Error("the door should have opened by now");
    worked.settle(true);

    // Back to the free attempts, rather than to where the count had climbed.
    expect(guessing(it, 6)).toEqual(letIn(6));
    expect(guess(it)).toBe(1_000);
  });

  /**
   * Without this, one burst leaves the daemon slow for good: nothing but a
   * success resets the count, and a success is what the burst is preventing.
   */
  it("a quarter of an hour in which nothing was tried", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    guessing(it, 10);

    clock.pass(15 * 60 * 1_000 + 1);

    expect(guessing(it, 6)).toEqual(letIn(6));
  });

  it("but not a gap shorter than that", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    guessing(it, 6);

    clock.pass(60_000);
    expect(guess(it)).toBe(0);
    expect(guess(it)).toBe(2_000);
  });
});

/**
 * A caller turned away is not a caller who guessed, so hammering a closed door
 * cannot push the wait up. Otherwise the escalation would run away from anyone
 * retrying, and the cap would be reached by persistence rather than by guesses.
 */
describe("being turned away", () => {
  it("does not count as an attempt", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    guessing(it, 6);
    const wait = guess(it);

    for (let asked = 0; asked < 50; asked += 1) it.begin();

    expect(guess(it)).toBe(wait);
  });
});

/**
 * Weighing a password is a memory-hard hash. A gate that closes once the
 * answer is known is a gate everything already in flight walked through, which
 * is both the free attempts spent on one batch and that many hashes at once.
 */
describe("attempts that overlap", () => {
  it("counts an attempt from the moment it begins", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    const held = Array.from({ length: 6 }, () => it.begin());
    for (const attempt of held) if (attempt.allowed) attempt.settle(false);

    // Six were begun, but only one of them was ever let in to be weighed.
    expect(guessing(it, 5)).toEqual(letIn(5));
    expect(guess(it)).toBe(1_000);
  });

  it("weighs one attempt at a time, whatever arrives beside it", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    const held = Array.from({ length: 30 }, () => it.begin());

    expect(held.filter((attempt) => attempt.allowed)).toHaveLength(1);
    expect(held[1]).toEqual({ allowed: false, wait: 1_000 });
  });

  it("lets the next one in once the first has settled", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    const first = it.begin();
    expect(it.begin().allowed).toBe(false);

    if (first.allowed) first.settle(false);

    expect(guess(it)).toBe(0);
  });

  /**
   * The slot is held by a caller, and a caller that never settles would
   * otherwise shut the login for good — which is the one route that reopens a
   * daemon nobody can get into.
   */
  it("takes the door back from an attempt that never settled", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    it.begin();
    expect(it.begin().allowed).toBe(false);

    clock.pass(30_000);

    expect(it.begin().allowed).toBe(true);
  });

  it("does not take it back from one that is merely slow", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    it.begin();
    clock.pass(29_999);

    expect(it.begin().allowed).toBe(false);
  });

  it("ignores an abandoned attempt settling after the door was handed on", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    const abandoned = it.begin();
    clock.pass(30_000);
    const holder = it.begin();

    if (abandoned.allowed) abandoned.settle(false);

    // The late settle released nothing, so the attempt now weighing still has it.
    expect(it.begin().allowed).toBe(false);
    if (holder.allowed) holder.settle(false);
    expect(it.begin().allowed).toBe(true);
  });

  it("settles once, so a stale settle cannot release the attempt after it", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    const first = it.begin();
    if (!first.allowed) throw new Error("the door should have been open");

    first.settle(false);
    const second = it.begin();
    first.settle(false);

    expect(second.allowed).toBe(true);
    expect(it.begin().allowed).toBe(false);
  });
});
