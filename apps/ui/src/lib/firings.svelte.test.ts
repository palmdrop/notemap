import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { firings, left, type Firing } from "./firings.svelte";

const research: Firing = {
  record: "r1",
  item: "one",
  name: "Research",
  href: "/items/one",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-09-30T10:00:00.000Z"));
  firings.clear();
});

afterEach(() => {
  firings.clear();
  vi.useRealTimers();
});

test("opens once however many times it is heard of, keeping what either knew", () => {
  const until = Date.parse("2026-09-30T10:00:15.000Z");

  firings.opened({ ...research, until });
  firings.opened(research);

  expect(firings.open).toEqual([{ ...research, until }]);
});

test("closes when the pool says how it ended", () => {
  firings.opened(research);
  firings.opened({ ...research, record: "r2" });

  firings.closed("r1");

  expect(firings.open.map((one) => one.record)).toEqual(["r2"]);
});

/** The log can say it landed before the tag's own look comes back. */
test("stays closed when it is opened again after", () => {
  firings.closed("r1");
  firings.opened(research);

  expect(firings.open).toEqual([]);
});

test("counts down to the window closing, and then says nothing", () => {
  const firing = {
    ...research,
    until: Date.parse("2026-09-30T10:00:15.000Z"),
  };

  expect(left(firing, Date.parse("2026-09-30T10:00:00.000Z"))).toBe(15);
  expect(left(firing, Date.parse("2026-09-30T10:00:14.200Z"))).toBe(1);
  expect(left(firing, Date.parse("2026-09-30T10:00:15.000Z"))).toBeUndefined();
  expect(left(research, Date.now())).toBeUndefined();
});

test("its clock ticks while anything is open, and stops when nothing is", () => {
  firings.opened(research);
  const from = firings.now;

  vi.advanceTimersByTime(3_000);
  expect(firings.now - from).toBe(3_000);

  firings.closed("r1");
  const stopped = firings.now;
  vi.advanceTimersByTime(3_000);
  expect(firings.now).toBe(stopped);
});
