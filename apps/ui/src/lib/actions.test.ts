import { describe, expect, it } from "vitest";

import { agentOf, failed, flattened, isCode, shortened } from "./actions";

describe("flattening a detail", () => {
  it("writes strings unquoted and everything else as it reads", () => {
    expect(
      flattened({ capability: "create-file", attempt: 5, giveUp: true }),
    ).toEqual([
      { key: "capability", value: "create-file" },
      { key: "attempt", value: "5" },
      { key: "giveUp", value: "true" },
    ]);
  });

  it("dots a nested object rather than stringifying it", () => {
    expect(
      flattened({ failure: { code: "unreachable", detail: "ENOENT" } }),
    ).toEqual([
      { key: "failure.code", value: "unreachable" },
      { key: "failure.detail", value: "ENOENT" },
    ]);
  });

  it("dots all the way down", () => {
    expect(flattened({ a: { b: { c: "deep" } } })).toEqual([
      { key: "a.b.c", value: "deep" },
    ]);
  });

  it("joins an array of scalars into one value", () => {
    expect(flattened({ tags: ["seedling", "kind/quote"] })).toEqual([
      { key: "tags", value: "seedling, kind/quote" },
    ]);
  });

  /** Joining these would read as one value; numbering them says there are two. */
  it("numbers an array that holds objects", () => {
    expect(
      flattened({ to: [{ destination: "one" }, { destination: "two" }] }),
    ).toEqual([
      { key: "to.0.destination", value: "one" },
      { key: "to.1.destination", value: "two" },
    ]);
  });

  it("yields no pair for a key with nothing under it", () => {
    expect(flattened({ tags: [], settings: {}, kept: "yes" })).toEqual([
      { key: "kept", value: "yes" },
    ]);
  });

  it("answers nothing at all for the empty detail most kinds carry", () => {
    expect(flattened({})).toEqual([]);
  });

  /** The point of flattening generically: nobody has to have written this kind. */
  it("reads a shape it has never seen", () => {
    expect(
      flattened({ whatever: { came: ["along", "later"], count: null } }),
    ).toEqual([
      { key: "whatever.came", value: "along, later" },
      { key: "whatever.count", value: "null" },
    ]);
  });
});

describe("the accent", () => {
  it("is spent on the three kinds that are failures", () => {
    const kinds = [
      "captured",
      "tagged",
      "routed",
      "delivery-failed",
      "delivery-cancelled",
      "work-failed",
      "work-abandoned",
      "purged",
      "destination-deleted",
      "actions-cleared",
    ];

    expect(kinds.filter(failed)).toEqual([
      "delivery-failed",
      "work-failed",
      "work-abandoned",
    ]);
  });

  it("finds the failure code wherever the flattening put it", () => {
    expect(isCode("code")).toBe(true);
    expect(isCode("failure.code")).toBe(true);
    expect(isCode("capability")).toBe(false);
    expect(isCode("codex")).toBe(false);
  });
});

describe("an id", () => {
  it("keeps its head and its tail", () => {
    expect(shortened("0198f0c2-9d3a-7b21-8e4f-112233445e6f")).toBe(
      "0198f0c2…5e6f",
    );
  });

  it("is left alone when there is nothing to save", () => {
    expect(shortened("short")).toBe("short");
  });
});

describe("who did it", () => {
  it("names a person as a person reading their own log would", () => {
    expect(agentOf({ kind: "person" })).toBe("you");
  });

  it("names the rest by what they are", () => {
    expect(agentOf({ kind: "notemap" })).toBe("notemap");
    expect(agentOf({ kind: "provider", provider: "ollama" })).toBe(
      "provider ollama",
    );
    expect(agentOf({ kind: "source", source: "shell-note" })).toBe(
      "source shell-note",
    );
  });
});
