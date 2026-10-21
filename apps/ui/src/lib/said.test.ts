import { expect, test } from "vitest";

import { filterOf } from "@notemap/client";

import { everyOf, nothingMatches } from "./said";

test("says every one of several as a sentence does", () => {
  expect(everyOf([])).toBe("");
  expect(everyOf(["reading"])).toBe("reading");
  expect(everyOf(["reading", "kind/quote"])).toBe("reading and kind/quote");
  expect(everyOf(["a", "b", "c"])).toBe("a, b and c");
});

const tags = (...names: string[]) => filterOf({ tags: names });

test("an emptied filter names its tags as a sentence does", () => {
  expect(nothingMatches(tags("a"))).toBe("Nothing matches a.");
  expect(nothingMatches(tags("a", "b"))).toBe("Nothing matches both a and b.");
  expect(nothingMatches(tags("a", "b", "c"))).toBe(
    "Nothing matches all of a, b and c.",
  );
});

test("an emptied filter says its states, destinations and sources, any one of each", () => {
  expect(
    nothingMatches(filterOf({ states: ["routed"], tags: ["kind/quote"] })),
  ).toBe("Nothing matches routed and kind/quote.");
  expect(
    nothingMatches(
      filterOf({
        states: ["routed", "archived"],
        destinations: ["d1"],
        tags: ["kind/quote"],
      }),
      (id) => (id === "d1" ? "obsidian" : id),
    ),
  ).toBe("Nothing matches routed or discarded, to obsidian and kind/quote.");
  expect(nothingMatches(filterOf({ sources: ["memos", "web"] }))).toBe(
    "Nothing matches from memos or from web.",
  );
});
