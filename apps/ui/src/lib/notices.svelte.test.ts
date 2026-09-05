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

test("a confirmation into a corner full of failures is the one thing not dropped", () => {
  for (let at = 0; at < 4; at += 1) {
    notices.raise({ what: `failure ${String(at)}`, standing: true });
  }

  notices.raise({ what: "routed · obsidian" });

  const said = notices.shown.map((notice) => notice.what);
  expect(said).toContain("routed · obsidian");
  expect(said).not.toContain("failure 0");
  expect(notices.folded).toBe(1);
});

test("that confirmation still goes on its own, leaving the failures behind", () => {
  for (let at = 0; at < 4; at += 1) {
    notices.raise({ what: `failure ${String(at)}`, standing: true });
  }
  notices.raise({ what: "routed · obsidian" });

  vi.advanceTimersByTime(10_000);

  expect(notices.shown.map((notice) => notice.what)).not.toContain(
    "routed · obsidian",
  );
  expect(notices.shown).toHaveLength(4);
  expect(notices.folded).toBe(0);
});

test("taking what a notice offered invokes it once and resolves the notice", () => {
  const put = vi.fn();
  const id = notices.raise({ what: "discarded", standing: true, offer: { label: "undo", take: put } });

  notices.take(id as string);
  notices.take(id as string);

  expect(put).toHaveBeenCalledTimes(1);
  expect(notices.shown).toHaveLength(0);
});

test("only the newest of a named notice stands", () => {
  for (const what of ["discarded · a", "discarded · b", "discarded · c"]) {
    notices.raise({
      what,
      standing: true,
      only: "discard",
      offer: { label: "undo", take: vi.fn() },
    });
  }

  expect(notices.shown.map((notice) => notice.what)).toEqual(["discarded · c"]);
  expect(notices.folded).toBe(0);
});

test("a name supersedes nothing that does not bear it", () => {
  notices.raise({ what: "delivery failed", standing: true });
  notices.raise({ what: "discarded · a", standing: true, only: "discard" });
  notices.raise({ what: "discarded · b", standing: true, only: "discard" });

  expect(notices.shown.map((notice) => notice.what)).toEqual([
    "delivery failed",
    "discarded · b",
  ]);
});

test("a standing notice carrying an offer survives a full corner", () => {
  notices.raise({
    what: "discarded · a",
    standing: true,
    only: "discard",
    offer: { label: "undo", take: vi.fn() },
  });
  for (const what of ["one", "two", "three", "four", "five"]) {
    notices.raise({ what });
  }

  expect(notices.shown.map((notice) => notice.what)).toContain("discarded · a");
});
