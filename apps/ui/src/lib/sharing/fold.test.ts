import { describe, expect, it } from "vitest";

import { wordsOf } from "./fold";

describe("the words of a share", () => {
  it("is the text alone where that is all there is", () => {
    expect(wordsOf({ text: "a line worth keeping" })).toBe(
      "a line worth keeping",
    );
  });

  it("puts a title above the text and a link below it", () => {
    expect(
      wordsOf({
        title: "An essay",
        text: "the part I liked",
        url: "https://example.org/essay",
      }),
    ).toBe("An essay\nthe part I liked\nhttps://example.org/essay");
  });

  it("says a link once where the text already carries it", () => {
    expect(
      wordsOf({
        text: "look at https://example.org/a",
        url: "https://example.org/a",
      }),
    ).toBe("look at https://example.org/a");
  });

  it("says a title once where the text already carries it", () => {
    expect(wordsOf({ title: "Same words", text: "Same words, and more" })).toBe(
      "Same words, and more",
    );
  });

  it("does not repeat a title that is the link", () => {
    expect(
      wordsOf({ title: "https://example.org/a", url: "https://example.org/a" }),
    ).toBe("https://example.org/a");
  });

  it("is the link alone where only a link came", () => {
    expect(wordsOf({ url: " https://example.org/a " })).toBe(
      "https://example.org/a",
    );
  });

  it("is empty where nothing but space came", () => {
    expect(wordsOf({ title: " ", text: "\n", url: "" })).toBe("");
    expect(wordsOf({})).toBe("");
  });
});
