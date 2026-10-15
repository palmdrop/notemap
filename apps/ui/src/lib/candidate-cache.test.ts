import { afterEach, expect, test } from "vitest";

import { forgetEverything, recall, remember } from "./candidate-cache";

afterEach(forgetEverything);

const headings = (label: string) => ({
  kind: "answered" as const,
  entries: [{ label, value: label }],
  truncated: false,
});

const about = (path: string) => ({
  destination: "vault",
  capability: "append",
  field: "heading",
  given: { path },
});

test("never draws one note's headings for another's", () => {
  remember(about("todo.md"), headings("Templates"));

  expect(recall(about("todo.md"))).toEqual(headings("Templates"));
  expect(recall(about("daily.md"))).toBeUndefined();
});

test("reads the same given in any order as the same ask", () => {
  const asked = { destination: "v", capability: "c", field: "f" };
  remember({ ...asked, given: { a: "1", b: "2" } }, headings("x"));

  expect(recall({ ...asked, given: { b: "2", a: "1" } })).toEqual(
    headings("x"),
  );
});
