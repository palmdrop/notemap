import { expect, test } from "vitest";

import { everyOf } from "./said";

test("says every one of several as a sentence does", () => {
  expect(everyOf([])).toBe("");
  expect(everyOf(["reading"])).toBe("reading");
  expect(everyOf(["reading", "kind/quote"])).toBe("reading and kind/quote");
  expect(everyOf(["a", "b", "c"])).toBe("a, b and c");
});
