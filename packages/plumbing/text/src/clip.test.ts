import { describe, expect, it } from "vitest";

import { clip, clipAtWord } from "./clip";

const roomy = { characters: 100, bytes: 1000 };

describe("clip", () => {
  it("keeps what fits whole", () => {
    expect(clip("a short line", roomy)).toBe("a short line");
    expect(clip("", roomy)).toBe("");
  });

  it("stops at the character budget", () => {
    expect(clip("abcdef", { characters: 4, bytes: 1000 })).toBe("abcd");
  });

  it("stops at the byte budget", () => {
    expect(clip("åäö", { characters: 100, bytes: 5 })).toBe("åä");
    expect(clip("åäö", { characters: 100, bytes: 6 })).toBe("åäö");
  });

  it("counts a decomposed letter as one character", () => {
    expect(clip("cafés", { characters: 4, bytes: 1000 })).toBe("café");
  });

  it("never leaves half of an astral letter", () => {
    expect(clip("ab𝒳c", { characters: 3, bytes: 1000 })).toBe("ab𝒳");
    expect(clip("ab𝒳c", { characters: 100, bytes: 5 })).toBe("ab");
  });

  it("keeps a syllable and its marks together", () => {
    expect(clip("हिन्दी", { characters: 1, bytes: 1000 })).toBe("हि");
  });

  it("stops before a grapheme heavy enough to overrun the bytes", () => {
    const heavy = `a${"́".repeat(40)}`;
    expect(clip(`b${heavy}`, { characters: 100, bytes: 20 })).toBe("b");
  });
});

describe("clip at a word", () => {
  it("keeps what fits whole", () => {
    expect(clipAtWord("a short line", roomy)).toBe("a short line");
  });

  it("ends where a word ends", () => {
    expect(
      clipAtWord("a bike rack that folds", { characters: 14, bytes: 1000 }),
    ).toBe("a bike rack ");
    expect(
      clipAtWord("a-bike-rack-that-folds", { characters: 13, bytes: 1000 }),
    ).toBe("a-bike-rack-");
  });

  it("cuts a first word that overruns as clip does", () => {
    expect(
      clipAtWord("antidisestablishmentarianism is", {
        characters: 8,
        bytes: 1000,
      }),
    ).toBe("antidise");
  });

  it("finds words in a script written without spaces", () => {
    expect(
      clipAtWord("東京で自転車を買った", { characters: 6, bytes: 1000 }),
    ).toBe("東京で自転車");
  });

  it("holds to the byte budget as well", () => {
    expect(clipAtWord("åå åå åå", { characters: 100, bytes: 11 })).toBe(
      "åå åå ",
    );
  });
});
