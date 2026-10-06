import type { Operation, PendingOperation } from "@notemap/client";
import { describe, expect, it } from "vitest";

import { about, done, inOrder, waitingSaid } from "./outbox";

const captured = (text: string) =>
  ({
    kind: "capture",
    envelope: { payload: { type: "note", content: { text } } },
  }) as unknown as Operation;

const tagged: Operation = { kind: "tag", item: "item-1", tag: "reading" };

describe("the drain command's subtitle", () => {
  it("says how many are waiting", () => {
    expect(waitingSaid(3)).toBe("3 waiting to send");
  });

  it("is cleared where nothing waits", () => {
    expect(waitingSaid(0)).toBeNull();
  });
});

describe("what an operation says it does", () => {
  it("names the tag a tagging adds", () => {
    expect(done(tagged)).toBe("Tag #reading");
  });

  it("is a capture where it is one", () => {
    expect(done(captured("words"))).toBe("Capture");
  });
});

describe("the note an operation is about", () => {
  it("is a capture's own words", () => {
    expect(about(captured("its own words"), () => "held")).toBe(
      "its own words",
    );
  });

  it("is the held copy's words for an operation naming an item", () => {
    expect(
      about(tagged, (item) => (item === "item-1" ? "held" : undefined)),
    ).toBe("held");
  });

  it("is nothing where the item is not held", () => {
    expect(about(tagged, () => undefined)).toBeUndefined();
  });
});

describe("the outbox, drawn", () => {
  it("runs oldest first", () => {
    const at = (id: string, when: string) =>
      ({
        id,
        at: when,
        state: "pending",
        operation: tagged,
      }) as PendingOperation;

    expect(
      inOrder([
        at("b", "2026-10-06T12:00:00.000Z"),
        at("a", "2026-10-04T21:00:00.000Z"),
      ]).map((entry) => entry.id),
    ).toEqual(["a", "b"]);
  });
});
