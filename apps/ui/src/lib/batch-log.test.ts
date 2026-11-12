import { expect, test } from "vitest";

import type { Action, Batch } from "@notemap/client";
import { anItem } from "@notemap/client/testing";

import { batchSaid } from "./batch-log";

const BATCH = "batch-7";
const TAG = "route/research";

let minted = 0;
function entry(
  kind: Action["kind"],
  subject: string,
  detail: Record<string, unknown> = {},
  at = "2026-11-12T10:00:00.000Z",
): Action {
  minted += 1;
  return {
    id: `action-${String(minted)}`,
    kind,
    subject,
    batch: BATCH,
    by: { kind: "person" },
    at,
    detail,
  } as Action;
}

const fired = (subject: string, record: string) => [
  entry("tagged", subject, { tag: TAG }),
  entry("template-fired", subject, { record, template: "t1" }),
];

const named = (id: string) => (id === "t1" ? "Research" : undefined);

test("counts a routing batch by how each reservation ended, as its notice does", () => {
  const said = batchSaid(
    [
      ...fired("a", "r1"),
      ...fired("b", "r2"),
      ...fired("c", "r3"),
      entry("routed", "a", { record: "r1" }, "2026-11-12T10:01:00.000Z"),
      entry("routed", "b", { record: "r2" }, "2026-11-12T10:01:00.000Z"),
      entry(
        "delivery-failed",
        "c",
        { record: "r3", failure: { code: "rejected-by-destination" } },
        "2026-11-12T10:01:00.000Z",
      ),
    ],
    undefined,
    named,
  );

  expect(said).toEqual({
    what: "2 notes routed",
    subject: "Research",
    why: "1 failed",
    alarm: true,
  });
});

test("counts a reservation with no ending yet as pending, and one the pool will retry too", () => {
  const said = batchSaid(
    [
      ...fired("a", "r1"),
      ...fired("b", "r2"),
      entry("delivery-failed", "b", {
        record: "r2",
        failure: { code: "unreachable" },
      }),
    ],
    undefined,
    named,
  );

  expect(said).toMatchObject({ what: "0 notes routed", why: "2 pending" });
});

test("does not take a trigger tag given back for the batch's own untag", () => {
  const said = batchSaid(
    [
      ...fired("a", "r1"),
      entry("delivery-cancelled", "a", { record: "r1" }),
      entry("untagged", "a", { tag: TAG, record: "r1", template: "t1" }),
    ],
    undefined,
    named,
  );

  expect(said).toMatchObject({
    what: "0 notes routed",
    subject: "Research",
    why: "1 cancelled",
  });
});

test("counts a discard by the items it discarded", () => {
  expect(
    batchSaid(
      [entry("archived", "a"), entry("archived", "b")],
      undefined,
      named,
    ),
  ).toEqual({ what: "2 notes discarded" });
});

test("counts what this client was answered, refusals and skips included, where it still holds it", () => {
  const held: Batch = {
    id: BATCH,
    action: { kind: "tag", tag: TAG },
    items: ["a", "b", "c"],
    outcomes: [
      { id: "a", outcome: "reserved", record: "r1", item: anItem("a") },
      { id: "b", outcome: "skipped", item: anItem("b") },
      { id: "c", outcome: "refused", error: { code: "trigger-refused" } },
    ],
  } as Batch;

  expect(
    batchSaid(
      [...fired("a", "r1"), entry("routed", "a", { record: "r1" })],
      held,
      named,
    ),
  ).toEqual({
    what: "1 note routed",
    subject: "Research",
    why: "1 already filed, 1 refused",
    alarm: true,
  });
});

test("says nothing where no entry says what the batch did", () => {
  expect(
    batchSaid([entry("routed", "a", { record: "r1" })], undefined, named),
  ).toBeUndefined();
});

test("never draws a middle dot between its counts", () => {
  const said = batchSaid(
    [
      ...fired("a", "r1"),
      ...fired("b", "r2"),
      entry("delivery-cancelled", "a", { record: "r1" }),
      entry("delivery-failed", "b", {
        record: "r2",
        failure: { code: "rejected-by-destination" },
      }),
    ],
    undefined,
    named,
  );

  expect(JSON.stringify(said)).not.toContain("·");
  expect(said?.why).toBe("1 failed, 1 cancelled");
});
