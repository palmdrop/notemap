import { describe, expect, it } from "vitest";

import { tagFilter } from "./filter";

describe("a tag filter", () => {
  it("trims each tag as tagging does and keeps one of each", () => {
    expect(tagFilter([" kind/quote", "project/a", "kind/quote "])).toEqual({
      kind: "ok",
      value: ["kind/quote", "project/a"],
    });
  });

  it("refuses a tag that trims to nothing, naming it", () => {
    expect(tagFilter(["kind/quote", "  "])).toEqual({
      kind: "refused",
      refusal: { kind: "tag-invalid", tag: "  " },
    });
  });

  it("is empty where no tag is named", () => {
    expect(tagFilter([])).toEqual({ kind: "ok", value: [] });
  });
});
