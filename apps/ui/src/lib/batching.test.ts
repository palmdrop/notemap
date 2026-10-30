import { expect, test } from "vitest";

import { anItem } from "@notemap/client/testing";

import { asking, counted, resultOf } from "./batching";

const TEMPLATE = { kind: "template", template: "research" } as const;
const ARCHIVE = { kind: "archive" } as const;

const filedBy = (id: string, template: string) =>
  anItem(id, {
    routing: {
      records: 1,
      pending: 0,
      to: [{ kind: "destination", destination: "vault" }],
      templates: [template],
    },
  });

test("counts what a template already filed as skipped, and what else was processed as again", () => {
  const items = [
    anItem("fresh"),
    filedBy("filed", "research"),
    filedBy("elsewhere", "reading"),
  ];

  expect(counted(items, TEMPLATE)).toEqual({ total: 3, skipped: 1, again: 1 });
});

test("counts what is already archived as skipped by a discard", () => {
  const items = [
    anItem("fresh"),
    anItem("gone", { archived: { archivedAt: "2026-08-17T10:00:00.000Z" } }),
  ];

  expect(counted(items, ARCHIVE)).toEqual({ total: 2, skipped: 1, again: 0 });
});

test("asks with the template's name and says what will not go as asked", () => {
  expect(
    asking({ total: 3, skipped: 1, again: 1 }, TEMPLATE, "Research links"),
  ).toEqual({
    question: "route 3 notes with Research links?",
    notes: [
      "1 already filed by it, and left as they are",
      "1 already processed, and filed again",
    ],
  });
});

test("asks a discard of one note in the singular, with nothing under it", () => {
  expect(
    asking({ total: 1, skipped: 0, again: 0 }, ARCHIVE, undefined),
  ).toEqual({ question: "discard 1 note?", notes: [] });
});

test("says a batch once, counting each way its items ended", () => {
  const raised = resultOf(
    TEMPLATE,
    "Research links",
    [
      { id: "a", outcome: "reserved", record: "r1", item: anItem("a") },
      { id: "b", outcome: "reserved", record: "r2", item: anItem("b") },
      { id: "c", outcome: "skipped", item: anItem("c") },
      { id: "d", outcome: "refused", error: { code: "no-such-item" } },
    ],
    ["routed", "failed"],
  );

  expect(raised).toEqual({
    what: "4 notes routed",
    subject: "Research links",
    why: "1 filed, 1 failed, 1 already filed, 1 refused",
    alarm: true,
  });
});

test("says a discard that all landed without the accent", () => {
  expect(
    resultOf(
      ARCHIVE,
      undefined,
      [{ id: "a", outcome: "archived", item: anItem("a") }],
      [],
    ),
  ).toEqual({ what: "1 note discarded", why: "1 discarded" });
});
