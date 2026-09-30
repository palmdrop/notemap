import { expect, test } from "vitest";

import type { Action } from "@notemap/client";

import { firingOf, noticeOf } from "./action-log";

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
  expect(said?.why).toBe("unreachable · still not mounted · back in the queue");
  expect(said?.standing).toBe(true);
});

/**
 * The failure it ends is the one notice that said why, so giving up takes its
 * place and keeps its reason rather than leaving it behind or losing it.
 */
test("a delivery given up on names where it was going and takes the failure's place", () => {
  const failed = noticeOf(
    anAction("delivery-failed", {
      record: "r1",
      destination: "vault",
      attempt: 5,
      failure: { code: "rejected", detail: "notes/a.md already exists" },
    }),
    reading,
  );
  const abandoned = noticeOf(
    anAction("work-abandoned", {
      work: "delivery",
      record: "r1",
      destination: "vault",
      attempt: 5,
      failure: { code: "rejected", detail: "notes/a.md already exists" },
    }),
    reading,
  );

  expect(abandoned?.what).toBe("given up · Vault");
  expect(abandoned?.why).toBe(
    "rejected · notes/a.md already exists · back in the queue",
  );
  expect(abandoned?.only).toBe(failed?.only);
  expect(abandoned?.only).toBe("delivery:r1");
});

test("a fired delivery given up on names the template the tag applied", () => {
  const said = noticeOf(
    anAction("work-abandoned", {
      work: "delivery",
      record: "r1",
      destination: "vault",
      template: "t1",
      firedByTag: true,
      failure: { code: "rejected", detail: "research/ is missing" },
    }),
    { ...reading, templateOf: () => "Research links" },
  );

  expect(said?.what).toBe("given up · Research links");
  expect(said?.why).toBe("rejected · research/ is missing · back in the queue");
});

test("work given up on that was about no record says only why", () => {
  const said = noticeOf(
    anAction("work-abandoned", {
      work: "mirror-write",
      failure: { code: "io", detail: "disk full" },
    }),
    reading,
  );

  expect(said?.what).toBe("given up");
  expect(said?.why).toBe("io · disk full");
  expect(said?.only).toBeUndefined();
});

const fired = {
  record: "r1",
  template: "t1",
  name: "Research links",
  destination: "vault",
  capability: "create",
  tag: "route/research",
};

test("a landing from a tag names the template the tag applied", () => {
  const said = noticeOf(anAction("routed", { ...fired, firedByTag: true }), {
    ...reading,
    templateOf: () => "Research links",
  });

  expect(said?.what).toBe("routed · Research links");
  expect(said?.standing).toBeUndefined();
});

test("a fired delivery that failed is one run with its record, as any other", () => {
  const said = noticeOf(
    anAction("delivery-failed", {
      ...fired,
      firedByTag: true,
      attempt: 1,
      failure: { code: "rejected", detail: "research/ is missing" },
    }),
    reading,
  );

  expect(said?.only).toBe("delivery:r1");
  expect(said?.standing).toBe(true);
});

test("a hand-made delivery that failed is one run with its record", () => {
  const said = noticeOf(
    anAction("delivery-failed", {
      record: "r1",
      destination: "vault",
      attempt: 1,
      failure: { code: "unreachable", detail: "not mounted" },
    }),
    reading,
  );

  expect(said?.only).toBe("delivery:r1");
});

test("a cancellation says what it gave back", () => {
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
  // A confirmation rather than something to act on: it goes on its own.
  expect(said?.standing).toBeUndefined();
});

test("a mark made by hand and taken back is said as undone, not as a routing cancelled", () => {
  const said = noticeOf(
    anAction("delivery-cancelled", { record: "r1", target: "user" }),
    reading,
  );

  expect(said?.what).toBe("manual mark undone");
  expect(said?.only).toBeUndefined();
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
};

test("a landing from a tag names the template rather than the destination", () => {
  const landed = noticeOf(
    anAction("routed", {
      record: "r1",
      template: "t1",
      firedByTag: true,
      destination: "vault",
    }),
    withTemplates,
  );

  expect(landed?.what).toBe("routed · Research");
  // Nothing is left to call off, so it lingers like any confirmation.
  expect(landed?.standing).toBeUndefined();
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

/** A firing has not happened yet, so it is work in flight and not a notice. */
test("a fired template is not a notice", () => {
  expect(
    noticeOf(anAction("template-fired", fired), withTemplates),
  ).toBeUndefined();
});

test("a fired template opens a firing, named for the template, with its window", () => {
  const said = firingOf(
    anAction("template-fired", {
      ...fired,
      until: "2026-09-03T10:00:15.000Z",
    }),
    withTemplates,
  );

  expect(said).toEqual({
    opened: {
      record: "r1",
      item: "one",
      name: "Research",
      href: "/log?item=one",
      until: Date.parse("2026-09-03T10:00:15.000Z"),
    },
  });
});

test("a firing the shell has no template for is named by the entry", () => {
  const said = firingOf(anAction("template-fired", fired), reading);

  expect(said).toMatchObject({ opened: { name: "Research links" } });
  expect(said).not.toHaveProperty("opened.until");
});

test("every way a route ends closes its firing", () => {
  for (const kind of [
    "routed",
    "delivery-failed",
    "work-abandoned",
    "delivery-cancelled",
  ]) {
    expect(firingOf(anAction(kind, { record: "r1" }), reading)).toEqual({
      closed: "r1",
    });
  }
});

test("an entry about no record touches no firing", () => {
  expect(firingOf(anAction("captured", {}), reading)).toBeUndefined();
  expect(
    firingOf(anAction("work-failed", { work: "mirror-write" }), reading),
  ).toBeUndefined();
});

/** A template made on another device, or since this shell read them, is not held yet. */
test("a landing from a template this shell does not hold names the destination", () => {
  const said = noticeOf(
    anAction("routed", {
      record: "r1",
      template: "t9",
      firedByTag: true,
      destination: "vault",
    }),
    { ...reading, templateOf: () => undefined },
  );

  expect(said?.what).toBe("routed · Vault");
});
