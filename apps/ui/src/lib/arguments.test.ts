import { expect, test } from "vitest";

import { argumentsOf } from "./arguments";

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
