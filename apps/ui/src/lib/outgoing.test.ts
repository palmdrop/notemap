import { expect, test } from "vitest";

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
  ).toEqual({ what: "capture · a thought", item: "one" });
});

test("archiving is said in the shell's word for it", () => {
  expect(outgoing({ kind: "archive", item: "one" })).toEqual({
    what: "discard",
    item: "one",
  });
});

test("a tag names the tag", () => {
  expect(outgoing({ kind: "untag", item: "one", tag: "kind/quote" })).toEqual({
    what: "untag · kind/quote",
    item: "one",
  });
});
