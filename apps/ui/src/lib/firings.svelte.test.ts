import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { firings, left, LOOKS_AFTER, type Firing } from "./firings.svelte";

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
  firings.asks(undefined);
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

/**
 * The delivery is attempted as the window closes, and the watcher's tempo is
 * far longer than the window: the corner would say `routing` for seconds after
 * the note was filed.
 */
test("asks the pool how it went just after the window closes, a few times and no more", async () => {
  const ask = vi.fn();
  firings.asks(ask);
  firings.opened({ ...research, until: Date.now() + 15_000 });

  await vi.advanceTimersByTimeAsync(15_000);
  expect(ask).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(LOOKS_AFTER.at(-1) ?? 0);
  expect(ask).toHaveBeenCalledTimes(LOOKS_AFTER.length);

  await vi.advanceTimersByTimeAsync(60_000);
  expect(ask).toHaveBeenCalledTimes(LOOKS_AFTER.length);
});

test("stops asking once the pool has said how it ended", async () => {
  const ask = vi.fn();
  firings.asks(ask);
  firings.opened({ ...research, until: Date.now() + 1_000 });

  await vi.advanceTimersByTimeAsync(1_000 + (LOOKS_AFTER[0] ?? 0) + 1_000);
  expect(ask).toHaveBeenCalledTimes(1);

  firings.closed("r1");
  await vi.advanceTimersByTimeAsync(60_000);
  expect(ask).toHaveBeenCalledTimes(1);
});

/** The countdown ticks by the second; the looks are not held to it. */
test("asks at each look's own moment rather than on the next tick", async () => {
  const ask = vi.fn();
  firings.asks(ask);
  firings.opened({ ...research, until: Date.now() + 1_000 });

  await vi.advanceTimersByTimeAsync(1_000 + LOOKS_AFTER[0] - 1);
  expect(ask).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(ask).toHaveBeenCalledOnce();
});

test("looks only ahead for a firing first heard of after its window closed", async () => {
  const ask = vi.fn();
  firings.asks(ask);
  firings.opened({ ...research, until: Date.now() - LOOKS_AFTER[1] - 1 });

  await vi.advanceTimersByTimeAsync(60_000);
  expect(ask).toHaveBeenCalledTimes(LOOKS_AFTER.length - 2);
});
