import { expect, test } from "vitest";

import type { RoutingRecord } from "@notemap/client";

import { saidOf } from "./routing";

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
      capability: "create-file",
      arguments: {},
    },
    ...overrides,
  } as RoutingRecord;
}

test("a delivered record says where it landed, and which capture it was", () => {
  const said = saidOf(
    aRecord({ pointer: "notes/inbox/picker.md" }),
    nameOf,
    "09-03 14:32 · the picker needs a trail",
  );

  expect(said.what).toBe("routed · Vault");
  expect(said.why).toBe("notes/inbox/picker.md");
  expect(said.about).toBe("09-03 14:32 · the picker needs a trail");
  expect(said.key).toBe("record:r1");
});

/** A destination that hands back no pointer still named a place to put it. */
test("a landing with no pointer falls back to the place the decision named", () => {
  const said = saidOf(
    aRecord({
      target: {
        kind: "destination",
        destination: "vault",
        capability: "create-or-append-file",
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

  expect(said.what).toBe("marked done");
});
