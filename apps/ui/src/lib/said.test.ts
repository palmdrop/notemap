import { expect, test } from "vitest";

import { everyOf, nothingMatches } from "./said";

test("says every one of several as a sentence does", () => {
  expect(everyOf([])).toBe("");
  expect(everyOf(["reading"])).toBe("reading");
  expect(everyOf(["reading", "kind/quote"])).toBe("reading and kind/quote");
  expect(everyOf(["a", "b", "c"])).toBe("a, b and c");
});

test("an emptied filter names its tags as a sentence does", () => {
  expect(nothingMatches(["a"])).toBe("Nothing matches a.");
  expect(nothingMatches(["a", "b"])).toBe("Nothing matches both a and b.");
  expect(nothingMatches(["a", "b", "c"])).toBe(
    "Nothing matches all of a, b and c.",
  );
});
