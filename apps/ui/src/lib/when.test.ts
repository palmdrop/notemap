import { describe, expect, test } from "vitest";

import { whenOf } from "./when";

/**
 * Built in the reader's own zone rather than written as UTC: the two words this
 * answers that a person checks against their own clock are `today` and
 * `yesterday`, so a test that fixed the boundary at Greenwich would pass here
 * and be wrong for most of the evening anywhere east of it.
 */
const local = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): string => new Date(year, month - 1, day, hour, minute).toISOString();

const NOW = new Date(2026, 8, 2, 12).getTime();

describe("how long ago, in a word", () => {
  test.each([
    [local(2026, 9, 2, 9), "today"],
    [local(2026, 9, 1, 23), "yesterday"],
    [local(2026, 8, 30, 10), "3 days"],
    [local(2026, 8, 27, 10), "6 days"],
    [local(2026, 8, 24, 10), "last week"],
    [local(2026, 8, 10, 10), "3 weeks"],
    [local(2026, 6, 2, 10), "3 months"],
    [local(2024, 3, 2, 10), "2024"],
  ])("reads %s as %s", (at, said) => {
    expect(whenOf(at, NOW)).toBe(said);
  });

  test("counts whole days rather than hours, so late last night is yesterday", () => {
    expect(whenOf(local(2026, 9, 1, 23, 59), NOW)).toBe("yesterday");
    expect(whenOf(local(2026, 9, 2, 0, 1), NOW)).toBe("today");
  });

  /** Which is what a UTC boundary got wrong for every reader east of Greenwich. */
  test("turns the day over at the reader's own midnight", () => {
    const justAfterMidnight = new Date(2026, 8, 2, 0, 30);
    const justBefore = new Date(2026, 8, 1, 23, 30);

    expect(whenOf(justAfterMidnight.toISOString(), NOW)).toBe("today");
    expect(whenOf(justBefore.toISOString(), NOW)).toBe("yesterday");
  });

  test("says nothing at all for a stamp it cannot read", () => {
    expect(whenOf("not a time", NOW)).toBe("");
  });
});
