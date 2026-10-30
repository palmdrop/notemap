import { afterEach, expect, test } from "vitest";

import { anItem } from "@notemap/client/testing";

import { tallying } from "./tallies";

afterEach(() => tallying.clear());

const reserved = (id: string, record: string) =>
  ({ id, outcome: "reserved", record, item: anItem(id) }) as const;

test("a batch with nothing left to wait for is said at once, and only once", () => {
  const batch = {
    id: "batch",
    action: { kind: "archive" } as const,
    items: ["a"],
    outcomes: [{ id: "a", outcome: "archived", item: anItem("a") } as const],
  };

  expect(tallying.answered(batch, undefined)?.what).toBe("1 note discarded");
  expect(tallying.answered(batch, undefined)).toBeUndefined();
});

test("a batch that reserved is said when its last reservation ends", () => {
  tallying.answered(
    {
      id: "batch",
      action: { kind: "template", template: "research" },
      items: ["a", "b"],
      outcomes: [reserved("a", "r1"), reserved("b", "r2")],
    },
    "Research links",
  );

  expect(tallying.counts("r1")).toBe(true);
  expect(tallying.ended("r1", "routed")).toBeUndefined();
  expect(tallying.ended("r1", "routed")).toBeUndefined();
  expect(tallying.ended("r2", "cancelled")).toMatchObject({
    what: "2 notes routed",
    why: "1 filed, 1 cancelled",
  });
});

test("a record no batch made is not counted", () => {
  expect(tallying.counts("elsewhere")).toBe(false);
  expect(tallying.ended("elsewhere", "routed")).toBeUndefined();
});
