import { describe, expect, it } from "vitest";

import { fold, holds, stringsIn, termsOf } from "./fold";

describe("fold", () => {
  it("ignores case and accents", () => {
    expect(fold("Café ÖLAND")).toBe("cafe oland");
    expect(fold("Café")).toBe(fold("Café"));
  });

  it("makes every run of whitespace one space, and trims it", () => {
    expect(fold("  a\n\tbike   rack ")).toBe("a bike rack");
  });

  it("leaves a letter that lower-casing decomposes whole", () => {
    expect(fold("İstanbul")).toBe("istanbul");
  });

  it("keeps every script, and the marks that make a different syllable", () => {
    expect(fold("が")).not.toBe(fold("か"));
    expect(fold("हिन्दी")).toBe("हिन्दी");
    expect(fold("東京で自転車を買った")).toBe("東京で自転車を買った");
    expect(fold("Привет")).toBe("привет");
  });
});

describe("terms", () => {
  it("are the folded words, once each", () => {
    expect(termsOf("Bike  rack bike")).toEqual(["bike", "rack"]);
  });

  it("are none for words that are only space", () => {
    expect(termsOf("  \n ")).toEqual([]);
  });
});

describe("holds", () => {
  const folded = fold("A sweeper for the hallway, from Lena's café");

  it("finds each term anywhere, inside words too", () => {
    expect(holds(folded, termsOf("weep"))).toBe(true);
    expect(holds(folded, termsOf("CAFE hall"))).toBe(true);
  });

  it("wants every term", () => {
    expect(holds(folded, termsOf("cafe kitchen"))).toBe(false);
  });

  it("holds for no terms at all", () => {
    expect(holds(folded, [])).toBe(true);
  });

  it("finds words in a script written without spaces", () => {
    expect(holds(fold("東京で自転車を買った"), termsOf("自転車"))).toBe(true);
  });
});

describe("strings in a value", () => {
  it("are every string, at any depth, in order", () => {
    expect(
      stringsIn({ text: "a", nested: [{ b: "b" }, 3, null, "c"], flag: true }),
    ).toEqual(["a", "b", "c"]);
  });
});
