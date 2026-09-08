import { expect, test } from "vitest";

import type { Action } from "@notemap/client";

import { noticeOf } from "./action-log";

const reading = {
  nameOf: (id: string) => (id === "vault" ? "Vault" : "a destination"),
  about: (item: string) => `/log?item=${item}`,
};

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
      capability: "append",
      pointer: "notes/daily.md",
    }),
    reading,
  );

  expect(said?.what).toBe("routed · Vault");
  expect(said?.why).toBe("notes/daily.md");
  expect(said?.standing).toBeUndefined();
});

/** The same fact the shell already reported when the gesture was made. */
test("a landing is keyed by its record, so it is said once", () => {
  const said = noticeOf(anAction("routed", { record: "r1" }), reading);

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
    reading,
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
    reading,
  );

  expect(said?.what).toBe("given up");
  expect(said?.why).toBe("back in the queue");
  expect(said?.standing).toBe(true);
});

const fired = {
  record: "r1",
  template: "t1",
  name: "Research links",
  destination: "vault",
  capability: "create",
  tag: "route/research",
};

test("a fired template stands without being drawn as an alarm", () => {
  const said = noticeOf(anAction("template-fired", fired), {
    ...reading,
    templateOf: () => "Research links",
    cancel: () => undefined,
  });

  expect(said?.what).toBe("routing · Research links");
  expect(said?.standing).toBe(true);
  // Nothing has gone wrong: it stands so its cancel does not time out.
  expect(said?.alarm).toBe(false);
  expect(said?.offer?.label).toBe("cancel");
  // Said once, whether the shell got there first or the log did.
  expect(said?.key).toBe("fired:r1");
});

test("a landing from a tag takes the place of the notice it resolves", () => {
  const said = noticeOf(anAction("routed", { ...fired, firedByTag: true }), {
    ...reading,
    templateOf: () => "Research links",
  });

  expect(said?.what).toBe("routed · Research links");
  expect(said?.only).toBe("fired");
  expect(said?.alarm).toBe(false);
});

/**
 * Two notices, one saying it is on its way and one saying it failed, is the
 * corner contradicting itself — and the first offers a cancel that would refuse.
 */
test("a fired delivery that failed takes that notice's place too", () => {
  const said = noticeOf(
    anAction("delivery-failed", {
      ...fired,
      firedByTag: true,
      attempt: 1,
      failure: { code: "rejected", detail: "research/ is missing" },
    }),
    reading,
  );

  expect(said?.only).toBe("fired");
  expect(said?.standing).toBe(true);
});

test("a fired delivery given up on takes it too", () => {
  const said = noticeOf(
    anAction("work-abandoned", {
      work: "deliver",
      record: "r1",
      template: "t1",
      firedByTag: true,
      attempt: 5,
      failure: { code: "rejected", detail: "research/ is missing" },
    }),
    reading,
  );

  expect(said?.only).toBe("fired");
});

test("a hand-made delivery that failed stands on its own", () => {
  const said = noticeOf(
    anAction("delivery-failed", {
      record: "r1",
      destination: "vault",
      attempt: 1,
      failure: { code: "unreachable", detail: "not mounted" },
    }),
    reading,
  );

  expect(said?.only).toBeUndefined();
});

test("a cancellation ends the firing it called off", () => {
  const said = noticeOf(
    anAction("delivery-cancelled", {
      record: "r1",
      template: "t1",
      firedByTag: true,
      tag: "route/research",
    }),
    reading,
  );

  expect(said?.what).toBe("routing cancelled");
  expect(said?.why).toBe("route/research taken back");
  expect(said?.only).toBe("fired");
  // A confirmation rather than something to act on: it goes on its own.
  expect(said?.standing).toBeUndefined();
});

test("everything else the log holds stays in the log", () => {
  expect(noticeOf(anAction("captured", {}), reading)).toBeUndefined();
  expect(noticeOf(anAction("tagged", {}), reading)).toBeUndefined();
  expect(noticeOf(anAction("purged", {}), reading)).toBeUndefined();
  expect(
    noticeOf(anAction("destination-deleted", {}), reading),
  ).toBeUndefined();
});

test("a notice about an item leads to the whole of it", () => {
  const raised = noticeOf(
    anAction("delivery-failed", {
      record: "r1",
      failure: { code: "rejected" },
    }),
    reading,
  );

  expect(raised?.href).toBe("/log?item=one");
});

test("work about nothing in particular leads nowhere in particular", () => {
  const raised = noticeOf(
    {
      ...anAction("work-failed", { work: "mirror-write" }),
      subject: undefined,
    },
    reading,
  );

  expect(raised?.href).toBeUndefined();
});

const withTemplates = {
  ...reading,
  templateOf: (id: string) => (id === "t1" ? "Research" : "a template"),
  cancel: (record: string, item: string) => {
    cancelled.push([record, item]);
  },
};

const cancelled: [string, string][] = [];

test("a fired template stands while its window is open, and offers the way out", () => {
  const said = noticeOf(
    anAction("template-fired", {
      record: "r1",
      template: "t1",
      name: "Research links",
      destination: "vault",
      tag: "route/research",
    }),
    withTemplates,
  );

  // The template's name, never the destination's: `route/research` is what was
  // pressed, and the notice may not claim anything has been written yet.
  expect(said?.what).toBe("routing · Research");
  expect(said?.standing).toBe(true);
  expect(said?.offer?.label).toBe("cancel");

  said?.offer?.take();
  expect(cancelled).toEqual([["r1", "one"]]);
});

test("one fired template stands at a time, and the landing takes its place", () => {
  const routing = noticeOf(
    anAction("template-fired", { record: "r1", template: "t1", name: "R" }),
    withTemplates,
  );
  const landed = noticeOf(
    anAction("routed", {
      record: "r1",
      template: "t1",
      firedByTag: true,
      destination: "vault",
    }),
    withTemplates,
  );

  expect(routing?.only).toBe(landed?.only);
  expect(landed?.what).toBe("routed · Research");
  // It carries only the way to dismiss it: nothing is left to call off.
  expect(landed?.standing).toBe(true);
  expect(landed?.offer).toBeUndefined();
});

test("a template a person took themselves lands as an ordinary route", () => {
  const said = noticeOf(
    anAction("routed", {
      record: "r1",
      template: "t1",
      firedByTag: false,
      destination: "vault",
    }),
    withTemplates,
  );

  expect(said?.what).toBe("routed · Vault");
  expect(said?.standing).toBeUndefined();
  expect(said?.only).toBeUndefined();
});

/** Nothing here can cancel, so nothing is offered that would do nothing. */
test("a fired template offers no way out where the reader has none", () => {
  const said = noticeOf(
    anAction("template-fired", { record: "r1", template: "t1", name: "R" }),
    reading,
  );

  expect(said?.what).toBe("routing · R");
  expect(said?.offer).toBeUndefined();
});
