import { expect, test } from "vitest";

import { argumentsOf, sameArguments } from "./arguments";

const schema = {
  type: "object",
  properties: {
    directory: { type: "string", title: "Directory" },
    filename: { type: "string", title: "Filename" },
  },
};

test("says what a delivery was given in the capability's own words", () => {
  expect(
    argumentsOf({ filename: "note.md", directory: "drafts" }, schema),
  ).toEqual([
    { name: "Directory", said: "drafts" },
    { name: "Filename", said: "note.md" },
  ]);
});

test("draws what the record carries and the schema does not know", () => {
  expect(
    argumentsOf({ directory: "drafts", template: "daily" }, schema),
  ).toEqual([
    { name: "Directory", said: "drafts" },
    { name: "template", said: "daily" },
  ]);
});

test("falls back to the keys where there is no schema to read", () => {
  expect(
    argumentsOf({ directory: "drafts", tags: ["a", "b"] }, undefined),
  ).toEqual([
    { name: "directory", said: "drafts" },
    { name: "tags", said: "a, b" },
  ]);
});

test("says a field left blank as the blank it was sent as", () => {
  expect(argumentsOf({ directory: "" }, schema)).toEqual([
    { name: "Directory", said: "" },
  ]);
});

/**
 * The form builds its object in the schema's order and the pool builds its in
 * the template's. Read as strings, an untouched template would then commit as a
 * decision of the person's own: the record would name no template, and an
 * `establish` one would never learn its folder is there.
 */
test("two argument sets are the same however their keys are ordered", () => {
  expect(
    sameArguments(
      { directory: "research", filename: "2026-09-07.md" },
      { filename: "2026-09-07.md", directory: "research" },
    ),
  ).toBe(true);
});

test("a changed value is a different set", () => {
  expect(
    sameArguments({ directory: "research" }, { directory: "reading" }),
  ).toBe(false);
});

test("a field one holds and the other does not is a different set", () => {
  expect(
    sameArguments(
      { directory: "research" },
      { directory: "research", folder: "require" },
    ),
  ).toBe(false);
});

test("nested objects are compared by what they say, not how they were written", () => {
  expect(
    sameArguments(
      { where: { column: "reading", board: "notes" } },
      { where: { board: "notes", column: "reading" } },
    ),
  ).toBe(true);
});
