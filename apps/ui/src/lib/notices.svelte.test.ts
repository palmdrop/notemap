import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { notices } from "./notices.svelte";

beforeEach(() => {
  vi.useFakeTimers();
  notices.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

test("a confirmation goes on its own", () => {
  notices.raise({ what: "routed · obsidian" });
  expect(notices.shown).toHaveLength(1);

  vi.advanceTimersByTime(10_000);
  expect(notices.shown).toHaveLength(0);
});

test("a standing notice holds until it is dismissed", () => {
  const id = notices.raise({ what: "delivery failed", standing: true });
  expect(id).toBeDefined();

  vi.advanceTimersByTime(60_000);
  expect(notices.shown).toHaveLength(1);

  notices.dismiss(id as string);
  expect(notices.shown).toHaveLength(0);
});

test("the corner drops the oldest confirmation and never a standing one", () => {
  notices.raise({ what: "one, standing", standing: true });
  for (const what of ["two", "three", "four", "five", "six"]) {
    notices.raise({ what });
  }

  const said = notices.shown.map((notice) => notice.what);
  expect(said).not.toContain("two");
  expect(said).toContain("one, standing");
  expect(said).toContain("six");
});

test("standing notices past the corner's room are counted, not lost", () => {
  for (let at = 0; at < 6; at += 1) {
    notices.raise({ what: `failure ${String(at)}`, standing: true });
  }

  expect(notices.shown).toHaveLength(4);
  expect(notices.folded).toBe(2);
});

test("a key is said once, however often it is raised", () => {
  expect(notices.raise({ what: "routed", key: "record-1" })).toBeDefined();
  expect(notices.raise({ what: "routed", key: "record-1" })).toBeUndefined();
  expect(notices.shown).toHaveLength(1);
});

test("a key can be marked as said without saying it", () => {
  notices.mark("record-2");

  expect(notices.said("record-2")).toBe(true);
  expect(notices.raise({ what: "routed", key: "record-2" })).toBeUndefined();
  expect(notices.shown).toHaveLength(0);
});

test("a key outlives the notice it was said with", () => {
  notices.raise({ what: "routed", key: "record-3" });
  vi.advanceTimersByTime(10_000);

  expect(notices.shown).toHaveLength(0);
  expect(notices.raise({ what: "routed", key: "record-3" })).toBeUndefined();
});
