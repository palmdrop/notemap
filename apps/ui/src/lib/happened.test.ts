import { expect, test } from "vitest";

import type { Action } from "@notemap/client";

import { noticeOf } from "./happened";

const nameOf = (id: string) => (id === "vault" ? "Vault" : "a destination");

function anAction(kind: string, detail: Record<string, unknown>): Action {
  return {
    id: "a1",
    kind,
    subject: "one",
    by: { kind: "notemap" },
    at: "2026-09-03T10:00:00.000Z",
    detail,
  } as Action;
}

test("a landing says where it went", () => {
  const said = noticeOf(
    anAction("routed", {
      record: "r1",
      destination: "vault",
      capability: "append-to-file",
      pointer: "notes/daily.md",
    }),
    nameOf,
  );

  expect(said?.what).toBe("routed · Vault");
  expect(said?.why).toBe("notes/daily.md");
  expect(said?.standing).toBeUndefined();
});

/** The same fact the shell already reported when the gesture was made. */
test("a landing is keyed by its record, so it is said once", () => {
  const said = noticeOf(anAction("routed", { record: "r1" }), nameOf);

  expect(said?.key).toBe("record:r1");
});

test("a failed delivery stands, and says what went wrong", () => {
  const said = noticeOf(
    anAction("delivery-failed", {
      record: "r1",
      destination: "vault",
      attempt: 2,
      failure: { code: "unreachable", detail: "the vault is not mounted" },
    }),
    nameOf,
  );

  expect(said?.what).toBe("delivery failed · Vault");
  expect(said?.why).toBe("unreachable · the vault is not mounted");
  expect(said?.standing).toBe(true);
  // One thing went wrong, however many attempts the pool wrote for it.
  expect(said?.key).toBe("failed:r1");
});

/** The reservation is gone, so the item is work again — and nothing else says so. */
test("a delivery given up on says the item is back in the queue", () => {
  const said = noticeOf(
    anAction("work-abandoned", {
      work: "deliver",
      record: "r1",
      attempt: 5,
      failure: { code: "unreachable", detail: "still not mounted" },
    }),
    nameOf,
  );

  expect(said?.what).toBe("given up");
  expect(said?.why).toBe("back in the queue");
  expect(said?.standing).toBe(true);
});

test("everything else the log holds stays in the log", () => {
  expect(noticeOf(anAction("captured", {}), nameOf)).toBeUndefined();
  expect(noticeOf(anAction("tagged", {}), nameOf)).toBeUndefined();
  expect(noticeOf(anAction("purged", {}), nameOf)).toBeUndefined();
  expect(noticeOf(anAction("destination-deleted", {}), nameOf)).toBeUndefined();
});
