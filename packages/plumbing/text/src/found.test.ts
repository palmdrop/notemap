import { describe, expect, it } from "vitest";

import { fold, holds, termsOf } from "./fold";
import { found, type Span } from "./found";

/** What each span covers, as written. */
function said(text: string, spans: readonly Span[]): readonly string[] {
  return spans.map(({ from, to }) => text.slice(from, to));
}

describe("found", () => {
  it("finds a term wherever it is, inside a word too", () => {
    const text = "A bike rack, and a rack for bikes";
    expect(said(text, found(text, ["rack"]))).toEqual(["rack", "rack"]);
    expect(said(text, found(text, ["ike"]))).toEqual(["ike", "ike"]);
  });

  it("finds nothing for no terms, or in no text", () => {
    expect(found("a bike rack", [])).toEqual([]);
    expect(found("", ["rack"])).toEqual([]);
    expect(found("a bike rack", ["car"])).toEqual([]);
    expect(found("a bike rack", [""])).toEqual([]);
  });

  it("folds case and accents as a filter's terms are, and points at the text as written", () => {
    const text = "Crème BRÛLÉE at the Café";
    expect(said(text, found(text, termsOf("creme brulee CAFE")))).toEqual([
      "Crème",
      "BRÛLÉE",
      "Café",
    ]);
  });

  it("takes an accent written as a mark of its own inside the span", () => {
    const text = "cafe\u0301 au lait";
    expect(said(text, found(text, termsOf("café")))).toEqual(["cafe\u0301"]);
    expect(said("cafe\u0301s", found("cafe\u0301s", termsOf("cafés")))).toEqual(
      ["cafe\u0301s"],
    );
  });

  it("takes all of a grapheme a match begins or ends inside", () => {
    const text = "x\u0301y";
    expect(said(text, found(text, ["x"]))).toEqual(["x\u0301"]);
  });

  it("keeps its offsets past a letter that folds longer or shorter than it is written", () => {
    const text = "İstanbul e\u0301\u0301 then the rack";
    expect(said(text, found(text, ["rack", "istanbul"]))).toEqual([
      "İstanbul",
      "rack",
    ]);
  });

  it("keeps its offsets past characters outside the basic plane", () => {
    const text = "🚲 bike 𝒳 rack";
    expect(said(text, found(text, ["bike", "rack"]))).toEqual(["bike", "rack"]);
  });

  it("never runs a term on across a space, even one carrying a mark", () => {
    expect(found("bike rack", ["kerack"])).toEqual([]);
    expect(found("bike\n\track", ["kerack"])).toEqual([]);
    expect(found("bike \u0301rack", ["kerack"])).toEqual([]);
    expect(holds(fold("bike \u0301rack"), ["kerack"])).toBe(false);
  });

  it("joins overlapping and touching spans, in the order of the text", () => {
    const text = "bicycle";
    expect(said(text, found(text, ["cle", "bicy", "cyc"]))).toEqual([
      "bicycle",
    ]);
    expect(found("aaa", ["aa"])).toEqual([{ from: 0, to: 3 }]);
    expect(found("bike", ["bi", "ke"])).toEqual([{ from: 0, to: 4 }]);
  });

  it("gives spans from several terms in the order of the text", () => {
    expect(found("rack bike rack", ["rack", "bike"])).toEqual([
      { from: 0, to: 4 },
      { from: 5, to: 9 },
      { from: 10, to: 14 },
    ]);
  });
});
