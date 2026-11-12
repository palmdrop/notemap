import { expect, test } from "vitest";

import { filterOf } from "@notemap/client";

import { found, type Span } from "./found";

/** What each span covers, as written. */
function said(text: string, spans: readonly Span[]): readonly string[] {
  return spans.map(({ from, to }) => text.slice(from, to));
}

const termsOf = (words: string) => filterOf({ words: [words] }).words;

test("finds a term wherever it is, inside a word too", () => {
  const text = "A bike rack, and a rack for bikes";
  expect(said(text, found(text, ["rack"]))).toEqual(["rack", "rack"]);
  expect(said(text, found(text, ["ike"]))).toEqual(["ike", "ike"]);
});

test("finds nothing for no terms, or in no text", () => {
  expect(found("a bike rack", [])).toEqual([]);
  expect(found("", ["rack"])).toEqual([]);
  expect(found("a bike rack", ["car"])).toEqual([]);
});

test("folds case and accents as the filter does, and points at the text as written", () => {
  const text = "Crème BRÛLÉE at the Café";
  expect(said(text, found(text, termsOf("creme brulee CAFE")))).toEqual([
    "Crème",
    "BRÛLÉE",
    "Café",
  ]);
});

test("an accent written as a mark of its own is inside the span", () => {
  const text = "café au lait";
  expect(said(text, found(text, termsOf("café")))).toEqual(["café"]);
});

test("a match in the middle of a grapheme takes all of it", () => {
  const text = "x́y";
  expect(said(text, found(text, ["x"]))).toEqual(["x́"]);
});

test("offsets stay true past a letter that folds longer or shorter than it is written", () => {
  const text = "İstanbul é́ then the rack";
  expect(said(text, found(text, ["rack", "istanbul"]))).toEqual([
    "İstanbul",
    "rack",
  ]);
});

test("offsets stay true past characters outside the basic plane", () => {
  const text = "🚲 bike 𝒳 rack";
  expect(said(text, found(text, ["bike", "rack"]))).toEqual(["bike", "rack"]);
});

test("a term never runs on across a space", () => {
  expect(found("bike rack", ["kerack"])).toEqual([]);
  expect(found("bike\n\track", ["kerack"])).toEqual([]);
});

test("overlapping and touching spans are one, in the order of the text", () => {
  const text = "bicycle";
  expect(said(text, found(text, ["cle", "bicy", "cyc"]))).toEqual(["bicycle"]);
  expect(found("aaa", ["aa"])).toEqual([{ from: 0, to: 3 }]);
});

test("spans from several terms come in the order of the text", () => {
  const text = "rack bike rack";
  expect(found(text, ["rack", "bike"])).toEqual([
    { from: 0, to: 4 },
    { from: 5, to: 9 },
    { from: 10, to: 14 },
  ]);
});
