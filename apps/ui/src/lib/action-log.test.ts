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

  expect(said?.what).toBe("routed");
  expect(said?.subject).toBe("Vault");
  expect(said?.why).toBe("notes/daily.md");
  expect(said?.alarm).toBeUndefined();
});

/** The same fact the shell already reported when the gesture was made. */
test("a landing is keyed by its record, so it is said once", () => {
  const said = noticeOf(anAction("routed", { record: "r1" }), reading);

  expect(said?.key).toBe("record:r1");
});

/** The pool will try again, so it is not over and is not said as a failure. */
test("a delivery the pool will try again says it is retrying, without the accent", () => {
  const said = noticeOf(
    anAction("delivery-failed", {
      record: "r1",
      destination: "vault",
      attempt: 2,
      failure: { code: "unreachable", detail: "the vault is not mounted" },
    }),
    reading,
  );

  expect(said?.what).toBe("retrying: the vault is not mounted");
  expect(said?.why).toBe("Vault, unreachable");
  expect(said?.alarm).toBeUndefined();
  // One thing went wrong, however many attempts the pool wrote for it.
  expect(said?.key).toBe("failed:r1");
});

/** The line has room for a few words: what happened, in the destination's own words. */
test("a delivery refused says why on the line, and the rest in the panel", () => {
  const said = noticeOf(
    anAction("delivery-failed", {
      record: "r1",
      destination: "vault",
      attempt: 1,
      failure: {
        code: "rejected-by-destination",
        detail: "taken.md is already there",
      },
    }),
    reading,
  );

  expect(said?.what).toBe("routing failed: taken.md is already there");
  expect(said?.why).toBe("Vault, rejected-by-destination, back in the queue");
  expect(said?.alarm).toBe(true);
});

test("a failure the destination gave no words for names where it was going", () => {
  const said = noticeOf(
    anAction("delivery-failed", {
      record: "r1",
      destination: "vault",
      failure: { code: "delivery-outcome-unknown" },
    }),
    reading,
  );

  expect(said?.what).toBe("routing failed");
  expect(said?.subject).toBe("Vault");
});

/**
 * The failure it ends is the one notice that said why, so giving up takes its
 * place and keeps its reason rather than leaving it behind or losing it.
 */
test("a delivery given up on keeps its reason and takes the failure's place", () => {
  const failed = noticeOf(
    anAction("delivery-failed", {
      record: "r1",
      destination: "vault",
      attempt: 5,
      failure: { code: "unreachable", detail: "still not mounted" },
    }),
    reading,
  );
  const abandoned = noticeOf(
    anAction("work-abandoned", {
      work: "delivery",
      record: "r1",
      destination: "vault",
      attempt: 5,
      failure: { code: "unreachable", detail: "still not mounted" },
    }),
    reading,
  );

  expect(abandoned?.what).toBe("routing failed: still not mounted");
  expect(abandoned?.why).toBe("Vault, unreachable, back in the queue");
  expect(abandoned?.alarm).toBe(true);
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
      failure: { code: "rejected" },
    }),
    { ...reading, templateOf: () => "Research links" },
  );

  expect(said?.what).toBe("routing failed");
  expect(said?.subject).toBe("Research links");
  expect(said?.why).toBe("Research links, rejected, back in the queue");
});

test("work given up on that was about no record says what work and why", () => {
  const said = noticeOf(
    anAction("work-abandoned", {
      work: "mirror-write",
      failure: { code: "io", detail: "disk full" },
    }),
    reading,
  );

  expect(said?.what).toBe("mirror-write failed: disk full");
  expect(said?.why).toBe("io");
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

  expect(said?.what).toBe("routed");
  expect(said?.subject).toBe("Research links");
  expect(said?.alarm).toBeUndefined();
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
  expect(said?.alarm).toBe(true);
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
  expect(said?.alarm).toBeUndefined();
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

  expect(landed?.what).toBe("routed");
  expect(landed?.subject).toBe("Research");
  // Nothing is left to call off, so it lingers like any confirmation.
  expect(landed?.alarm).toBeUndefined();
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

  expect(said?.what).toBe("routed");
  expect(said?.subject).toBe("Vault");
  expect(said?.alarm).toBeUndefined();
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

/** Still pending, so its cancel is still real. */
test("a delivery the pool will try again leaves its firing open", () => {
  expect(
    firingOf(
      anAction("delivery-failed", {
        record: "r1",
        failure: { code: "unreachable", detail: "the vault is not mounted" },
      }),
      reading,
    ),
  ).toBeUndefined();
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

  expect(said?.what).toBe("routed");
  expect(said?.subject).toBe("Vault");
});
