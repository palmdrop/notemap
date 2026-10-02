import { expect, test } from "vitest";

import type { Capability, RoutingRecord } from "@notemap/client";

import { placeIn, placeShort, readingOf, saidOf, wentTo } from "./routing";

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
  const said = saidOf(aRecord({ pointer: "notes/inbox/picker.md" }), nameOf, {
    about: "09-03 14:32 · the picker needs a trail",
    href: "/items/one",
  });

  expect(said.what).toBe("routed");
  expect(said.subject).toBe("Vault");
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

  expect(said.what).toBe("retrying");
  expect(said.subject).toBe("Vault");
  expect(said.what).not.toContain("routed");
  expect(said.why).toContain("not delivered yet");
  // Unkeyed, or the watcher could never say the landing this one is waiting for.
  expect(said.key).toBeUndefined();
});

test("marking processed is routing to the person, and says so", () => {
  const said = saidOf(aRecord({ target: { kind: "user" } }), nameOf);

  expect(said.what).toBe("marked processed");
});

test("a record on a row reads as its destination and the last segment of the place", () => {
  const said = wentTo(aRecord({ pointer: "notes/inbox/picker.md" }), nameOf);

  expect(said.name).toBe("Vault");
  expect(said.place).toBe("…/picker.md");
  // The full place is still there for whoever hovers.
  expect(said.title).toBe("notes/inbox/picker.md");
  // The capability is the adapter's word, and delivered is what a record with
  // no alarm on it already means.
  expect(said.pending).toBeUndefined();
});

test("a record the pool has not carried out says it is pending", () => {
  const said = wentTo(
    aRecord({ state: "pending", pointer: "notes/inbox/picker.md" }),
    nameOf,
  );

  expect(said.place).toBe("…/picker.md");
  expect(said.pending).toBe(true);
});

test("a place with one segment has nothing to elide", () => {
  expect(placeShort("decisions.md")).toBe("decisions.md");
  expect(placeShort("notes/decisions.md")).toBe("…/decisions.md");
});

test("a decision made by hand reads as done, with the note beside it", () => {
  const said = wentTo(
    aRecord({ target: { kind: "user", note: "pasted into the standup doc" } }),
    nameOf,
  );

  expect(said.name).toBe("manual");
  expect(said.note).toBe("pasted into the standup doc");
});

test("a decision made by hand with nothing written says only done", () => {
  expect(wentTo(aRecord({ target: { kind: "user" } }), nameOf)).toEqual({
    name: "manual",
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

  expect(said.place).toBe("…/2026-09-07.md");
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

  expect(said.title).toBe("reading, 2026-09-07");
});

const PATHED = {
  name: "create",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    properties: {
      path: { type: "string", "x-notemap-path": true },
      frontmatter: {
        type: "string",
        enum: ["full", "none"],
        "x-notemap-inherits": true,
      },
    },
  },
} as unknown as Capability;

const HANDLED = {
  name: "create",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    properties: { channel: { type: "string" } },
  },
} as unknown as Capability;

/**
 * A frontmatter mode is a setting taken for one delivery: `research.md, none`
 * reads as two places, and `none` says nothing about what it is.
 */
test("a setting a schema marks as inherited is never part of the place", () => {
  const said = wentTo(
    aRecord({
      state: "pending",
      target: {
        kind: "destination",
        destination: "vault",
        capability: "create",
        arguments: { path: "research/2026.md", frontmatter: "none" },
      },
    }),
    nameOf,
    undefined,
    readingOf(PATHED),
  );

  expect(said.title).toBe("research/2026.md");
});

/** An are.na block's id is a handle; the channel it went into is the place. */
test("a pointer that is not a path gives way to the place the decision named", () => {
  const record = aRecord({
    pointer: "48213077",
    target: {
      kind: "destination",
      destination: "vault",
      capability: "create",
      arguments: { channel: "1234" },
    },
  });
  const called = (field: string, value: string) =>
    field === "channel" && value === "1234" ? "Reading" : undefined;

  expect(placeIn(record, called, readingOf(HANDLED))).toBe("Reading");
  expect(placeIn(record, called, readingOf(PATHED))).toBe("48213077");
});

/** Drawn and then taken back, the handle would read as a place for the length of a request. */
test("a place is held back while the capability is still being described", () => {
  const record = aRecord({
    pointer: "48213077",
    target: {
      kind: "destination",
      destination: "vault",
      capability: "create",
      arguments: { channel: "1234" },
    },
  });

  expect(placeIn(record, undefined, "asking")).toBeUndefined();
  expect(wentTo(record, nameOf, undefined, "asking")).toEqual({
    name: nameOf("vault"),
  });
  // A destination nothing could describe still says where it landed.
  expect(placeIn(record, undefined, undefined)).toBe("48213077");
});

const SPLIT = {
  name: "create",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    properties: {
      directory: { type: "string", "x-notemap-path": "folders" },
      filename: { type: "string", "x-notemap-path": "leaf" },
    },
  },
} as unknown as Capability;

const APPENDING = {
  name: "append",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    properties: {
      path: { type: "string", "x-notemap-path": true },
      heading: { type: "string" },
    },
  },
} as unknown as Capability;

const pendingWith = (
  capability: string,
  args: Record<string, string>,
): RoutingRecord =>
  aRecord({
    state: "pending",
    target: {
      kind: "destination",
      destination: "vault",
      capability,
      arguments: args,
    },
  });

test("a path split into folders and a leaf reads as one path", () => {
  const said = wentTo(
    pendingWith("create", {
      directory: "projects/research/2026",
      filename: "a.md",
    }),
    nameOf,
    undefined,
    readingOf(SPLIT),
  );

  expect(said.title).toBe("projects/research/2026/a.md");
  expect(said.place).toBe("…/a.md");
});

/** No filename yet: the pointer is what will say what the file was called. */
test("folders with no leaf read as the folder, ending in a slash", () => {
  const said = wentTo(
    pendingWith("create", { directory: "projects/research/2026" }),
    nameOf,
    undefined,
    readingOf(SPLIT),
  );

  expect(said.title).toBe("projects/research/2026/");
  expect(said.place).toBe("…/2026/");
});

test("a leaf with its folders at the root reads as the leaf alone", () => {
  const said = wentTo(
    pendingWith("create", { directory: "", filename: "a.md" }),
    nameOf,
    undefined,
    readingOf(SPLIT),
  );

  expect(said.title).toBe("a.md");
});

test("a whole path keeps what follows it after a comma", () => {
  const said = wentTo(
    pendingWith("append", { path: "research/2026.md", heading: "Links" }),
    nameOf,
    undefined,
    readingOf(APPENDING),
  );

  expect(said.title).toBe("research/2026.md, Links");
});

test("a capability that marks no path reads every field after a comma", () => {
  const said = wentTo(
    pendingWith("create", { directory: "research", filename: "a.md" }),
    nameOf,
    undefined,
    readingOf(HANDLED),
  );

  expect(said.title).toBe("research, a.md");
});

test("a folder keeps its own name when cut, rather than the nothing after it", () => {
  expect(placeShort("projects/2026/")).toBe("…/2026/");
  expect(placeShort("2026/")).toBe("2026/");
});

const marking = (roles: Record<string, unknown>) =>
  ({
    name: "create",
    accepts: ["text"],
    argumentsSchema: {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(roles).map(([name, role]) => [
          name,
          { type: "string", "x-notemap-path": role },
        ]),
      ),
    },
  }) as unknown as Capability;

test.each([
  ["two whole paths", { a: true, b: true }],
  ["two folders fields", { a: "folders", b: "folders" }],
  ["two leaves", { a: "folders", b: "leaf", c: "leaf" }],
  ["a whole path beside a split one", { a: true, b: "folders" }],
  ["a leaf with no folders", { a: "leaf" }],
])("a capability that marks %s marks no path", (_, roles) => {
  expect(readingOf(marking(roles))).toEqual({ settings: [], pathed: false });
});
