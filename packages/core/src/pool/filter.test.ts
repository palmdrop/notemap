import { describe, expect, it } from "vitest";

import { MAX_WORDS, tagFilter, wordsFilter } from "./filter";

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

describe("a words filter", () => {
  it("folds the words into terms, once each", () => {
    expect(wordsFilter(" Café  bike CAFE ")).toEqual({
      kind: "ok",
      value: ["cafe", "bike"],
    });
  });

  it("is no terms where the words are blank", () => {
    expect(wordsFilter("   ")).toEqual({ kind: "ok", value: [] });
  });

  it("refuses words longer than a search", () => {
    expect(wordsFilter("a".repeat(MAX_WORDS))).toMatchObject({ kind: "ok" });
    expect(wordsFilter("a".repeat(MAX_WORDS + 1))).toEqual({
      kind: "refused",
      refusal: { kind: "words-too-long", limit: MAX_WORDS },
    });
  });
});
