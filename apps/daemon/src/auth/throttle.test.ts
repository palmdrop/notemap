import type { Clock, Timestamp } from "@notemap/core";
import { describe, expect, it } from "vitest";

import { createLoginThrottle } from "./throttle";

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

/** Fails `count` times in a row, without any time passing between them. */
const failing = (
  it: ReturnType<typeof createLoginThrottle>,
  count: number,
): void => {
  for (let attempt = 0; attempt < count; attempt += 1) it.failed();
};

describe("what the login throttle allows", () => {
  it("lets a person mistype a few times without punishing them", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    failing(it, 5);

    expect(it.waitFor()).toBe(0);
  });

  it("closes the door on the attempt after that", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    failing(it, 6);

    expect(it.waitFor()).toBe(1_000);
  });

  it("doubles the wait with every further attempt", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    failing(it, 6);
    const waits = [it.waitFor()];

    for (const doubled of [2_000, 4_000, 8_000, 16_000]) {
      clock.pass(waits[waits.length - 1] ?? 0);
      it.failed();
      expect(it.waitFor()).toBe(doubled);
      waits.push(doubled);
    }
  });

  /** Bounded on purpose: an unbounded wait is a lock, and a lock is a denial. */
  it("stops doubling at half a minute, however long it goes on", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    for (let attempt = 0; attempt < 40; attempt += 1) {
      clock.pass(60_000);
      it.failed();
    }

    expect(it.waitFor()).toBe(30_000);
  });

  it("opens again as the wait passes", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    failing(it, 6);
    clock.pass(999);
    expect(it.waitFor()).toBe(1);

    clock.pass(1);
    expect(it.waitFor()).toBe(0);
  });
});

describe("what clears the count", () => {
  it("a sign-in that worked", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    failing(it, 10);
    expect(it.waitFor()).toBeGreaterThan(0);

    it.passed();

    expect(it.waitFor()).toBe(0);
    // And the count went with it, so the next mistype starts from nothing.
    failing(it, 5);
    expect(it.waitFor()).toBe(0);
  });

  /**
   * Without this, one burst leaves the daemon slow for good: nothing but a
   * success resets the count, and a success is what the burst is preventing.
   */
  it("a quarter of an hour in which nothing was tried", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    failing(it, 10);

    clock.pass(15 * 60 * 1_000 + 1);
    it.failed();

    expect(it.waitFor()).toBe(0);
  });

  it("but not a gap shorter than that", () => {
    const clock = frozenClock();
    const it = throttle(clock);

    failing(it, 6);

    clock.pass(60_000);
    it.failed();

    expect(it.waitFor()).toBe(2_000);
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

    failing(it, 6);
    const wait = it.waitFor();

    for (let asked = 0; asked < 50; asked += 1) it.waitFor();

    expect(it.waitFor()).toBe(wait);
  });
});
