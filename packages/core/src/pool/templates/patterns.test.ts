import { describe, expect, it } from "vitest";

import type { ItemId, SourceId, Timestamp } from "#types/domain/ids";
import { checkPatterns, expandPatterns, type Expansion } from "./patterns";

/** Half past ten on a Swedish September evening, which is the next day in UTC. */
const LATE = "2026-09-05T20:32:00.000Z" as Timestamp;

const against = (overrides: Partial<Expansion> = {}): Expansion => ({
  capturedAt: LATE,
  zone: "UTC",
  item: "itm-5b1e" as ItemId,
  source: "web-manual" as SourceId,
  ...overrides,
});

const expand = (pattern: string, overrides: Partial<Expansion> = {}): string =>
  expandPatterns({ path: pattern }, against(overrides))["path"] as string;

describe("the patterns a template may write", () => {
  it.each([
    ["{{captured_at}}", "2026-09-05"],
    ["{{captured_at:date}}", "2026-09-05"],
    ["{{captured_at:datetime}}", "2026-09-05 20-32"],
    ["{{captured_at:time}}", "20-32"],
    ["{{captured_at:month}}", "2026-09"],
    ["{{captured_at:week}}", "2026-W36"],
    ["{{captured_at:year}}", "2026"],
    ["{{item}}", "itm-5b1e"],
    ["{{source}}", "web-manual"],
  ])("expands %s to %s", (pattern, expected) => {
    expect(expand(pattern)).toBe(expected);
  });

  it("reads the date in the offset the capture was made at", () => {
    // 22:32 in Stockholm on the 5th; 20:32 UTC, and the same instant.
    expect(expand("{{captured_at}}", { utcOffset: 120 })).toBe("2026-09-05");
    // 16:32 in New York on the 5th, and 04:32 on the 6th in Tokyo.
    expect(expand("{{captured_at}}", { utcOffset: -240 })).toBe("2026-09-05");
    expect(expand("{{captured_at}}", { utcOffset: 540 })).toBe("2026-09-06");
  });

  it("falls back to the host's zone rather than to UTC", () => {
    const midnight = "2026-09-05T23:30:00.000Z" as Timestamp;

    expect(
      expand("{{captured_at}}", {
        capturedAt: midnight,
        zone: "Europe/Stockholm",
      }),
    ).toBe("2026-09-06");
    expect(expand("{{captured_at}}", { capturedAt: midnight })).toBe(
      "2026-09-05",
    );
  });

  it("prefers the capture's own offset to the host's zone", () => {
    expect(
      expand("{{captured_at:time}}", {
        utcOffset: 120,
        zone: "Pacific/Auckland",
      }),
    ).toBe("22-32");
  });

  it("puts a whole place together, pattern and literal alike", () => {
    expect(expand("research/{{captured_at:month}}/{{captured_at}}.md")).toBe(
      "research/2026-09/2026-09-05.md",
    );
  });

  it("expands strings at every depth, and leaves every other value alone", () => {
    const expanded = expandPatterns(
      {
        path: "{{captured_at}}.md",
        nested: { tags: ["from {{source}}", 3, true, null] },
        count: 2,
      },
      against(),
    );

    expect(expanded).toEqual({
      path: "2026-09-05.md",
      nested: { tags: ["from web-manual", 3, true, null] },
      count: 2,
    });
  });
});

describe("what a template may not write", () => {
  it("refuses a field no item has", () => {
    expect(checkPatterns({ path: "research/{{captured}}.md" })).toEqual({
      kind: "unknown-pattern-field",
      pattern: "{{captured}}",
      field: "captured",
    });
  });

  it("refuses a format nobody named", () => {
    expect(checkPatterns({ path: "{{captured_at:YYYY-MM-DD}}.md" })).toEqual({
      kind: "unknown-pattern-format",
      pattern: "{{captured_at:YYYY-MM-DD}}",
      format: "YYYY-MM-DD",
    });
  });

  it("refuses a format on a field that has none", () => {
    expect(checkPatterns({ path: "{{item:short}}.md" })).toMatchObject({
      kind: "unknown-pattern-format",
      format: "short",
    });
  });

  it("finds one at any depth", () => {
    expect(
      checkPatterns({ nested: { list: ["fine", "{{nope}}"] } }),
    ).toMatchObject({ kind: "unknown-pattern-field" });
  });

  it("accepts a template with no patterns at all", () => {
    expect(checkPatterns({ path: "inbox/a-thought.md" })).toBeUndefined();
  });

  it("accepts every pattern in the table, which is what makes expansion total", () => {
    expect(
      checkPatterns({
        path: "{{captured_at}}/{{captured_at:datetime}}/{{captured_at:time}}/{{captured_at:month}}/{{captured_at:week}}/{{captured_at:year}}/{{item}}/{{source}}",
      }),
    ).toBeUndefined();
  });
});
