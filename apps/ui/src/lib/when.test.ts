import { describe, expect, test } from "vitest";

import { whenOf } from "./when";

const NOW = Date.parse("2026-09-02T12:00:00.000Z");

describe("how long ago, in a word", () => {
  test.each([
    ["2026-09-02T09:00:00.000Z", "today"],
    ["2026-09-01T23:00:00.000Z", "yesterday"],
    ["2026-08-30T10:00:00.000Z", "3 days"],
    ["2026-08-27T10:00:00.000Z", "6 days"],
    ["2026-08-24T10:00:00.000Z", "last week"],
    ["2026-08-10T10:00:00.000Z", "3 weeks"],
    ["2026-06-02T10:00:00.000Z", "3 months"],
    ["2024-03-02T10:00:00.000Z", "2024"],
  ])("reads %s as %s", (at, said) => {
    expect(whenOf(at, NOW)).toBe(said);
  });

  test("counts whole days rather than hours, so late last night is yesterday", () => {
    expect(whenOf("2026-09-01T23:59:00.000Z", NOW)).toBe("yesterday");
    expect(whenOf("2026-09-02T00:01:00.000Z", NOW)).toBe("today");
  });

  test("says nothing at all for a stamp it cannot read", () => {
    expect(whenOf("not a time", NOW)).toBe("");
  });
});
