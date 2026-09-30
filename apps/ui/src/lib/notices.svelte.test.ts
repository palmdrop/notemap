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
    standing: true,
    offer: { label: "undo", take: put },
  });

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
  notices.raise({ what: "delivery failed", standing: true, only: "record" });
  notices.raise({ what: "routed · research", only: "record" });
  vi.advanceTimersByTime(60_000);

  expect(notices.shown.map((notice) => notice.what)).toEqual([
    "routed · research",
  ]);

  notices.release();
  vi.advanceTimersByTime(4_000);
  expect(notices.shown).toHaveLength(0);
});

test("letting go of the status line does not start a standing notice leaving", () => {
  notices.raise({ what: "delivery failed", standing: true });

  notices.hold();
  notices.release();
  vi.advanceTimersByTime(60_000);

  expect(notices.shown).toHaveLength(1);
});

test("the message line says the newest live notice", () => {
  notices.raise({ what: "delivery failed", standing: true });
  notices.raise({ what: "copied" });
  expect(notices.latest?.what).toBe("copied");

  vi.advanceTimersByTime(4_000);
  expect(notices.latest?.what).toBe("delivery failed");
});

test("what stands is counted apart from what lingers", () => {
  notices.raise({ what: "delivery failed", standing: true });
  notices.raise({ what: "given up", standing: true });
  notices.raise({ what: "copied" });

  expect(notices.standing.map((notice) => notice.what)).toEqual([
    "delivery failed",
    "given up",
  ]);
});

/** The panel reads back what the line has already let go of. */
test("the history keeps what has gone, and says which is still live", () => {
  const failed = notices.raise({ what: "delivery failed", standing: true });
  notices.raise({ what: "copied" });
  vi.advanceTimersByTime(4_000);
  notices.dismiss(failed as string);
  notices.raise({ what: "routed · vault", standing: true });

  expect(notices.history.map((notice) => [notice.what, notice.live])).toEqual([
    ["delivery failed", false],
    ["copied", false],
    ["routed · vault", true],
  ]);
});

test("the history keeps both sides of a notice that took another's place", () => {
  notices.raise({ what: "delivery failed", standing: true, only: "record" });
  notices.raise({ what: "given up", standing: true, only: "record" });

  expect(notices.shown.map((notice) => notice.what)).toEqual(["given up"]);
  expect(notices.history.map((notice) => notice.what)).toEqual([
    "delivery failed",
    "given up",
  ]);
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
  notices.raise({ what: "delivery failed", standing: true });

  notices.clearHistory();

  expect(notices.history.map((notice) => notice.what)).toEqual([
    "delivery failed",
  ]);
});

test("the history holds the last hundred", () => {
  for (let at = 0; at < 105; at += 1) {
    notices.raise({ what: `said ${String(at)}` });
  }

  expect(notices.history).toHaveLength(100);
  expect(notices.history[0]?.what).toBe("said 5");
});
