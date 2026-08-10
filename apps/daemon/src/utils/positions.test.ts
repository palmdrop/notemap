import { describe, expect, it } from "vitest";

import type { Timestamp } from "@notemap/core";

import { feedUrl, formatPosition, parsePosition } from "./positions";

const AT = "2026-08-08T09:00:00.000Z";

describe("reading a position off the wire", () => {
  it("takes everything after the first comma as the id", () => {
    expect(parsePosition(`${AT},item-1`)).toEqual({ at: AT, id: "item-1" });
  });

  it("keeps an id that contains commas, since an id may", () => {
    expect(parsePosition(`${AT},a,b,c`)).toEqual({ at: AT, id: "a,b,c" });
  });

  it("takes a bare instant as a position with no id", () => {
    expect(parsePosition(AT)).toEqual({ at: AT });
  });

  it("normalises a date to midnight UTC", () => {
    expect(parsePosition("2026-08-08")).toEqual({
      at: "2026-08-08T00:00:00.000Z",
    });
  });

  it("normalises an offset to UTC", () => {
    expect(parsePosition("2026-08-08T09:00:00+02:00,item-1")).toEqual({
      at: "2026-08-08T07:00:00.000Z",
      id: "item-1",
    });
  });

  it("refuses anything that is not an ISO 8601 instant", () => {
    for (const raw of [
      "",
      ",item-1",
      "half past four,item-1",
      "not-a-time",
      "Aug 8 2026",
      "8/8/2026",
      "1754640000",
      "2026-02-31",
      "2026-08-08T09:00:00",
    ]) {
      expect(parsePosition(raw)).toBeUndefined();
    }
  });

  it("refuses a trailing comma rather than reading an empty id", () => {
    expect(parsePosition(`${AT},`)).toBeUndefined();
  });
});

describe("writing one back", () => {
  it("round-trips a canonical position", () => {
    for (const raw of [AT, `${AT},item-1`, `${AT},a,b`]) {
      expect(formatPosition(parsePosition(raw)!)).toBe(raw);
    }
  });
});

describe("the next URL", () => {
  it("carries the order, the limit and the position, ready to fetch", () => {
    const url = feedUrl("oldest-first", 25, {
      at: AT as Timestamp,
      id: "item-1",
    });

    const parsed = new URL(url, "http://localhost");
    expect(parsed.pathname).toBe("/v1/feed");
    expect(parsed.searchParams.get("order")).toBe("oldest-first");
    expect(parsed.searchParams.get("limit")).toBe("25");
    expect(parsed.searchParams.get("after")).toBe(`${AT},item-1`);
  });

  it("escapes the position, so an id with a separator in it survives", () => {
    const url = feedUrl("newest-first", 1, {
      at: AT as Timestamp,
      id: "a&b=c?d",
    });

    expect(new URL(url, "http://localhost").searchParams.get("after")).toBe(
      `${AT},a&b=c?d`,
    );
  });
});
