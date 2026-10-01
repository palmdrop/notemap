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

  vi.advanceTimersByTime(4_000);
  expect(notices.shown).toHaveLength(0);
});

/** Nothing has to be cleared: the panel is where it is read again. */
test("what went wrong lingers long enough to read, and goes on its own too", () => {
  notices.raise({
    what: "routing failed: taken.md is already there",
    alarm: true,
  });

  vi.advanceTimersByTime(5_000);
  expect(notices.shown).toHaveLength(1);

  vi.advanceTimersByTime(5_000);
  expect(notices.shown).toHaveLength(0);
  expect(notices.history).toHaveLength(1);
});

test("what went wrong is counted until the panel is opened", () => {
  notices.raise({ what: "routing failed", alarm: true });
  notices.raise({ what: "copied" });
  notices.raise({ what: "edit refused", alarm: true });
  vi.advanceTimersByTime(60_000);

  expect(notices.unseen).toBe(2);

  notices.seen();
  expect(notices.unseen).toBe(0);
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

test("taking what a notice offered invokes it once and resolves the notice", () => {
  const put = vi.fn();
  const id = notices.raise({
    what: "discarded",
    offer: { label: "undo", take: put },
  });

  notices.take(id as string);
  notices.take(id as string);

  expect(put).toHaveBeenCalledTimes(1);
  expect(notices.shown).toHaveLength(0);
});

test("only the newest of a named notice is live", () => {
  for (const what of ["discarded · a", "discarded · b", "discarded · c"]) {
    notices.raise({
      what,
      only: "discard",
      offer: { label: "undo", take: vi.fn() },
    });
  }

  expect(notices.shown.map((notice) => notice.what)).toEqual(["discarded · c"]);
});

test("a name supersedes nothing that does not bear it", () => {
  notices.raise({ what: "routing failed", alarm: true });
  notices.raise({ what: "discarded · a", only: "discard" });
  notices.raise({ what: "discarded · b", only: "discard" });

  expect(notices.shown.map((notice) => notice.what)).toEqual([
    "routing failed",
    "discarded · b",
  ]);
});

test("a notice offering something lingers long enough to reach for it", () => {
  notices.raise({ what: "discarded", offer: { label: "undo", take: vi.fn() } });

  vi.advanceTimersByTime(5_000);
  expect(notices.shown).toHaveLength(1);

  vi.advanceTimersByTime(5_000);
  expect(notices.shown).toHaveLength(0);
});

test("a held status line lets nothing leave, and lingers again once let go", () => {
  notices.raise({ what: "copied" });

  notices.hold();
  vi.advanceTimersByTime(60_000);
  expect(notices.shown).toHaveLength(1);

  notices.release();
  vi.advanceTimersByTime(3_000);
  expect(notices.shown).toHaveLength(1);
  vi.advanceTimersByTime(1_000);
  expect(notices.shown).toHaveLength(0);
});

test("a notice raised into a held status line waits to be let go", () => {
  notices.hold();
  notices.raise({ what: "retrying", only: "record" });
  notices.raise({ what: "routed · research", only: "record" });
  vi.advanceTimersByTime(60_000);

  expect(notices.shown.map((notice) => notice.what)).toEqual([
    "routed · research",
  ]);

  notices.release();
  vi.advanceTimersByTime(4_000);
  expect(notices.shown).toHaveLength(0);
});

test("the message line says the newest live notice", () => {
  notices.raise({ what: "routing failed", alarm: true });
  notices.raise({ what: "copied" });
  expect(notices.latest?.what).toBe("copied");

  vi.advanceTimersByTime(4_000);
  expect(notices.latest?.what).toBe("routing failed");
});

/** The panel reads back what the line has already let go of. */
test("the history keeps what has gone, and says which is still live", () => {
  notices.raise({ what: "routing failed", alarm: true });
  notices.raise({ what: "copied" });
  vi.advanceTimersByTime(4_000);

  expect(notices.history.map((notice) => [notice.what, notice.live])).toEqual([
    ["routing failed", true],
    ["copied", false],
  ]);
});

test("the history keeps both sides of a notice that took another's place", () => {
  notices.raise({ what: "retrying", only: "record" });
  notices.raise({ what: "routing failed", alarm: true, only: "record" });

  expect(notices.shown.map((notice) => notice.what)).toEqual([
    "routing failed",
  ]);
  expect(notices.history.map((notice) => notice.what)).toEqual([
    "retrying",
    "routing failed",
  ]);
});

/** A delivery refused and then given up on is one failure, told twice by the pool. */
test("a failure taking a failure's place is read back once, and counted once", () => {
  notices.raise({ what: "routing failed: taken", alarm: true, only: "record" });
  notices.raise({ what: "routing failed: taken", alarm: true, only: "record" });

  expect(notices.history.map((notice) => notice.what)).toEqual([
    "routing failed: taken",
  ]);
  expect(notices.unseen).toBe(1);
});

test("a failure taking the place of one already read is not counted again", () => {
  notices.raise({ what: "routing failed", alarm: true, only: "record" });
  notices.seen();
  notices.raise({ what: "routing failed", alarm: true, only: "record" });

  expect(notices.unseen).toBe(0);
});

test("a notice that has gone offers nothing", () => {
  const put = vi.fn();
  const id = notices.raise({
    what: "discarded",
    offer: { label: "undo", take: put },
  });
  vi.advanceTimersByTime(10_000);

  notices.take(id as string);

  expect(put).not.toHaveBeenCalled();
});

test("clearing the history keeps what is live", () => {
  notices.raise({ what: "copied" });
  vi.advanceTimersByTime(4_000);
  notices.raise({ what: "routing failed", alarm: true });

  notices.clearHistory();

  expect(notices.history.map((notice) => notice.what)).toEqual([
    "routing failed",
  ]);
});

test("the history holds the last hundred", () => {
  for (let at = 0; at < 105; at += 1) {
    notices.raise({ what: `said ${String(at)}` });
  }

  expect(notices.history).toHaveLength(100);
  expect(notices.history[0]?.what).toBe("said 5");
});

test("a settled offer is taken off whatever notice made it, and the notice stays", () => {
  notices.raise({
    what: "discarded",
    settles: "discarded:one",
    offer: { label: "undo", take: vi.fn() },
  });
  notices.raise({
    what: "discarded",
    settles: "discarded:two",
    offer: { label: "undo", take: vi.fn() },
  });

  notices.settled("discarded:one");

  expect(notices.shown.map((notice) => notice.offer?.label)).toEqual([
    undefined,
    "undo",
  ]);
});
