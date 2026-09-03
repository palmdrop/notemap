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

test("a delivered record says where it landed", () => {
  const said = saidOf(aRecord({ pointer: "notes/inbox/picker.md" }), nameOf);

  expect(said.what).toBe("routed · Vault");
  expect(said.why).toBe("notes/inbox/picker.md");
  expect(said.key).toBe("record:r1");
});

test("a pending record claims no landing, and leaves the word to the delivery", () => {
  const said = saidOf(aRecord({ state: "pending" }), nameOf);

  expect(said.what).toBe("deferred · Vault");
  expect(said.what).not.toContain("routed");
  // Keyed, and phase 4 could never say the `routed` this one is still waiting for.
  expect(said.key).toBeUndefined();
});

test("marking processed is routing to the person, and reads as done", () => {
  const said = saidOf(aRecord({ target: { kind: "user" } }), nameOf);

  expect(said.what).toBe("done");
});
