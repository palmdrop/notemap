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
      action: { kind: "tag", tag: "route/research" },
      items: ["a", "b"],
      outcomes: [reserved("a", "r1"), reserved("b", "r2")],
    },
    "Research links",
  );

  expect(tallying.counts("r1")).toBe(true);
  expect(tallying.ended("r1", "routed")).toBeUndefined();
  expect(tallying.ended("r1", "routed")).toBeUndefined();
  expect(tallying.ended("r2", "cancelled")).toMatchObject({
    what: "1 note routed",
    why: "1 cancelled",
  });
});

test("a record no batch made is not counted", () => {
  expect(tallying.counts("elsewhere")).toBe(false);
  expect(tallying.ended("elsewhere", "routed")).toBeUndefined();
});

const archiving = (id: string) => ({
  id,
  action: { kind: "archive" } as const,
  items: ["a"],
  outcomes: [{ id: "a", outcome: "archived", item: anItem("a") } as const],
});

test("a batch let go of to make room is never said again", () => {
  for (let n = 0; n < 60; n += 1)
    tallying.answered(archiving(`b${String(n)}`), undefined);

  expect(tallying.knows("b0")).toBe(true);
  expect(tallying.answered(archiving("b0"), undefined)).toBeUndefined();
});

test("a reservation that ends before the pool's answer still counts toward its batch", () => {
  tallying.sent("batch");
  tallying.fired("r1", "batch");

  expect(tallying.counts("r1")).toBe(true);
  expect(tallying.ended("r1", "routed")).toBeUndefined();
  expect(
    tallying.answered(
      {
        id: "batch",
        action: { kind: "tag", tag: "route/research" },
        items: ["a"],
        outcomes: [reserved("a", "r1")],
      },
      "Research links",
    ),
  ).toMatchObject({ what: "1 note routed" });
  expect(tallying.over("r1")).toBe(true);
});

test("a reservation another device's batch made is not this shell's to count", () => {
  tallying.fired("r1", "theirs");

  expect(tallying.counts("r1")).toBe(false);
});
