import { expect, test } from "vitest";

import { logHref } from "./href";

test("narrows to a subject and carries the order it is being read in", () => {
  expect(logHref("oldest-first", "0198f0c2-item")).toBe(
    "/log?item=0198f0c2-item&order=oldest-first",
  );
});

test("widens again without losing the order", () => {
  expect(logHref("oldest-first")).toBe("/log?order=oldest-first");
});

test("escapes a subject that is not a bare id", () => {
  expect(logHref("newest-first", "a b&c")).toContain("item=a+b%26c");
});

test("carries the kinds it is narrowed to, in the pool's own words", () => {
  expect(logHref("newest-first", undefined, ["routed", "template-fired"])).toBe(
    "/log?kind=routed%2Ctemplate-fired&order=newest-first",
  );
});
