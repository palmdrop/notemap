import { expect, test } from "vitest";

import type { RoutingRecord } from "@notemap/client";

import { saidOf, wentTo } from "./routing";

const nameOf = (id: string) => (id === "vault" ? "Vault" : "a destination");

function aRecord(overrides: Partial<RoutingRecord> = {}): RoutingRecord {
  return {
    id: "r1",
    item: "one",
    at: "2026-09-03T10:00:00.000Z",
    state: "delivered",
    target: {
      kind: "destination",
      destination: "vault",
      capability: "create",
      arguments: {},
    },
    ...overrides,
  } as RoutingRecord;
}

test("a delivered record says where it landed, and which capture it was", () => {
  const said = saidOf(
    aRecord({ pointer: "notes/inbox/picker.md" }),
    nameOf,
    { about: "09-03 14:32 · the picker needs a trail", href: "/items/one" },
  );

  expect(said.what).toBe("routed · Vault");
  expect(said.why).toBe("notes/inbox/picker.md");
  expect(said.about).toBe("09-03 14:32 · the picker needs a trail");
  expect(said.href).toBe("/items/one");
  expect(said.key).toBe("record:r1");
});

/** A destination that hands back no pointer still named a place to put it. */
test("a landing with no pointer falls back to the place the decision named", () => {
  const said = saidOf(
    aRecord({
      target: {
        kind: "destination",
        destination: "vault",
        capability: "create-or-append",
        arguments: { path: "notes/inbox/picker.md", heading: "" },
      },
    }),
    nameOf,
  );

  expect(said.why).toBe("notes/inbox/picker.md");
});

/** It was attempted and did not go, which is a thing a person can act on knowing. */
test("a pending record reads as retrying, and claims no landing", () => {
  const said = saidOf(aRecord({ state: "pending" }), nameOf);

  expect(said.what).toBe("retrying · Vault");
  expect(said.what).not.toContain("routed");
  expect(said.why).toContain("not delivered yet");
  // Unkeyed, or the watcher could never say the landing this one is waiting for.
  expect(said.key).toBeUndefined();
});

test("marking processed is routing to the person, and says so", () => {
  const said = saidOf(aRecord({ target: { kind: "user" } }), nameOf);

  expect(said.what).toBe("marked processed");
});

test("a record on a row reads as its destination and the place it landed", () => {
  const said = wentTo(aRecord({ pointer: "notes/inbox/picker.md" }), nameOf);

  expect(said.said).toBe("Vault · notes/inbox/picker.md");
  // The capability is the adapter's word, and delivered is what a record with
  // no alarm on it already means.
  expect(said.aside).toBeUndefined();
});

test("a record the pool has not carried out says the one state worth saying", () => {
  const said = wentTo(
    aRecord({ state: "pending", pointer: "notes/inbox/picker.md" }),
    nameOf,
  );

  expect(said.said).toBe("Vault · notes/inbox/picker.md");
  expect(said.aside).toBe("pending");
});

test("a decision made by hand reads as done, with the note beside it", () => {
  const said = wentTo(
    aRecord({ target: { kind: "user", note: "pasted into the standup doc" } }),
    nameOf,
  );

  expect(said.said).toBe("manual");
  expect(said.aside).toBe("pasted into the standup doc");
});

test("a decision made by hand with nothing written says only done", () => {
  expect(wentTo(aRecord({ target: { kind: "user" } }), nameOf)).toEqual({
    said: "manual",
  });
});

/**
 * A folder mode is a condition about getting somewhere, not the somewhere. It
 * is notemap's own argument rather than the destination's, drawn as its own
 * control where a person sets it, and reading it out beside the path made one
 * decision look like two places.
 */
test("a pending record's place leaves notemap's own arguments out of it", () => {
  const said = wentTo(
    aRecord({
      state: "pending",
      target: {
        kind: "destination",
        destination: "vault",
        capability: "create-or-append",
        arguments: { path: "research/2026-09-07.md", folder: "require" },
      },
    }),
    nameOf,
  );

  expect(said.said).toBe("Vault · research/2026-09-07.md");
  expect(said.aside).toBe("pending");
});

/** Everything the destination itself named is drawn, whatever it called it. */
test("a place that is not a path draws every argument the destination named", () => {
  const said = wentTo(
    aRecord({
      state: "pending",
      target: {
        kind: "destination",
        destination: "vault",
        capability: "add-card",
        arguments: { column: "reading", title: "2026-09-07" },
      },
    }),
    nameOf,
  );

  expect(said.said).toBe("Vault · reading · 2026-09-07");
});
