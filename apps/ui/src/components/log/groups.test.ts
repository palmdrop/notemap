import { expect, test } from "vitest";

import type { Action } from "@notemap/client";

import { grouped } from "./groups";

function entry(
  id: string,
  at: string,
  overrides: Partial<Action> = {},
): Action {
  return {
    id,
    kind: "routed",
    subject: "item",
    by: { kind: "person" },
    at: `2026-11-12T10:${at}:00.000Z`,
    detail: {},
    ...overrides,
  } as Action;
}

const nothing = () => undefined;

test("draws a batch once, where its first entry falls, and its later entries nowhere else", () => {
  const rows = [
    entry("e5", "05", { batch: "b1" }),
    entry("e4", "04"),
    entry("e3", "03", { batch: "b1", kind: "tagged" }),
  ];

  const drawn = grouped(rows, {
    order: "newest-first",
    grouping: true,
    whole: nothing,
  });

  expect(
    drawn.map((one) => (one.kind === "batch" ? one.id : one.action.id)),
  ).toEqual(["b1", "e4"]);
  expect(drawn[0]).toMatchObject({ at: "2026-11-12T10:05:00.000Z" });
});

test("holds what the walk has not reached, read by the batch, in reading order", () => {
  const rows = [entry("e5", "05", { batch: "b1" })];
  const whole = [
    entry("e1", "01", { batch: "b1", kind: "tagged" }),
    entry("e5", "05", { batch: "b1" }),
    entry("e2", "02", { batch: "b1", kind: "template-fired" }),
  ];

  const [group] = grouped(rows, {
    order: "newest-first",
    grouping: true,
    whole: (id) => (id === "b1" ? whole : undefined),
  });

  // A firing draws no row of its own, in a group or out of one.
  expect(
    group?.kind === "batch" ? group.entries.map((one) => one.id) : [],
  ).toEqual(["e5", "e1"]);
});

test("holds only the kinds the reading is narrowed to", () => {
  const rows = [entry("e5", "05", { batch: "b1" })];
  const whole = [
    entry("e1", "01", { batch: "b1", kind: "tagged" }),
    entry("e5", "05", { batch: "b1" }),
  ];

  const [group] = grouped(rows, {
    order: "oldest-first",
    grouping: true,
    kinds: ["routed"],
    whole: () => whole,
  });

  expect(
    group?.kind === "batch" ? group.entries.map((one) => one.id) : [],
  ).toEqual(["e5"]);
});

test("draws every entry as it is where the reading does not group", () => {
  const rows = [
    entry("e2", "02", { batch: "b1" }),
    entry("e1", "01", { batch: "b1" }),
  ];

  expect(
    grouped(rows, { order: "newest-first", grouping: false, whole: nothing }),
  ).toEqual([
    { kind: "action", action: rows[0] },
    { kind: "action", action: rows[1] },
  ]);
});
