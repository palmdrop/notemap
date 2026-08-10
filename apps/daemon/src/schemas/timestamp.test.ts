import { describe, expect, it } from "vitest";

import { instant, toTimestamp } from "./timestamp";

const accepts = (value: string) => instant.safeParse(value).success;

describe("what the API accepts as an instant", () => {
  it("takes ISO 8601 date-times carrying an offset", () => {
    for (const value of [
      "2026-08-08T09:00:00.000Z",
      "2026-08-08T09:00:00Z",
      "2026-08-08T09:00Z",
      "2026-08-08T09:00:00.123456Z",
      "2026-08-08T09:00:00+02:00",
      "2026-08-08T09:00:00-05:30",
    ]) {
      expect(accepts(value), value).toBe(true);
    }
  });

  it("takes a date alone", () => {
    expect(accepts("2026-08-08")).toBe(true);
  });

  it("refuses a date-time with no offset, which names no instant", () => {
    // Reading it as UTC or as the daemon's own zone both silently move the
    // capture, and there is nothing in the string to choose between them.
    expect(accepts("2026-08-08T09:00:00")).toBe(false);
  });

  it("refuses spellings that are not ISO 8601", () => {
    for (const value of [
      "Aug 8 2026",
      "8/8/2026",
      "yesterday",
      "1754640000",
      "",
    ]) {
      expect(accepts(value), value).toBe(false);
    }
  });

  it("refuses a date that does not exist", () => {
    // `Date.parse` takes this one and rolls it over to March 3rd.
    expect(accepts("2026-02-31")).toBe(false);
    expect(accepts("2026-13-01")).toBe(false);
    expect(accepts("2026-08-08T25:00:00Z")).toBe(false);
  });
});

describe("normalising to what core means by a timestamp", () => {
  it("converts an offset to UTC", () => {
    expect(toTimestamp("2026-08-08T09:00:00+02:00")).toBe(
      "2026-08-08T07:00:00.000Z",
    );
  });

  it("reads a date alone as midnight UTC", () => {
    expect(toTimestamp("2026-08-08")).toBe("2026-08-08T00:00:00.000Z");
  });

  it("leaves a canonical spelling alone", () => {
    expect(toTimestamp("2026-08-08T09:00:00.000Z")).toBe(
      "2026-08-08T09:00:00.000Z",
    );
  });
});
