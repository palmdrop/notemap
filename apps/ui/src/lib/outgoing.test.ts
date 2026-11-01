import { expect, test } from "vitest";

import type { Operation } from "@notemap/client";

import { outgoing } from "./outgoing";

test("a capture names its own first words", () => {
  expect(
    outgoing({
      kind: "capture",
      envelope: {
        id: "one",
        source: "web",
        sourceItemId: "one",
        capturedAt: "2026-09-30T10:00:00.000Z",
        payload: {
          type: "note",
          content: { text: "a thought\nand more" },
          metadata: {},
          assets: [],
        },
      },
    }),
  ).toEqual({ what: "capture", subject: "a thought", item: "one" });
});

test("archiving is said in the shell's word for it", () => {
  expect(outgoing({ kind: "archive", item: "one" })).toEqual({
    what: "discard",
    item: "one",
  });
});

test("a tag names the tag", () => {
  expect(outgoing({ kind: "untag", item: "one", tag: "kind/quote" })).toEqual({
    what: "untag",
    subject: "kind/quote",
    item: "one",
  });
});

test("a batch says how many notes, and names no one item", () => {
  expect(
    outgoing({
      kind: "batch",
      batch: "batch-1",
      items: ["one", "two"],
      action: { kind: "archive" },
    }),
  ).toEqual({ what: "discard", subject: "2 notes" });
});

test("a batch says its deed as the same deed on one item would", () => {
  const batch = (action: Extract<Operation, { kind: "batch" }>["action"]) =>
    outgoing({ kind: "batch", batch: "b", items: ["one", "two"], action });

  expect(batch({ kind: "tag", tag: "reading" })).toEqual({
    what: "tag",
    subject: "reading, 2 notes",
  });
  expect(batch({ kind: "untag", tag: "reading" })).toEqual({
    what: "untag",
    subject: "reading, 2 notes",
  });
  expect(batch({ kind: "unarchive" })).toEqual({
    what: "unarchive",
    subject: "2 notes",
  });
});
