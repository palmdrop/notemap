import { expect, test } from "vitest";

import { folderIn, withFolder } from "./output";

const LINE = {
  properties: { path: { type: "string", "x-notemap-path": true } },
};
const SPLIT = {
  properties: {
    directory: { type: "string", "x-notemap-path": "folders" },
    filename: { type: "string", "x-notemap-path": "leaf" },
  },
};

test("reads the folder through whichever path field the capability marks", () => {
  expect(folderIn(LINE, { path: "library/a.md" })).toBe("library");
  expect(folderIn(LINE, { path: "library/" })).toBe("library");
  expect(
    folderIn(SPLIT, { directory: "research/2026/", filename: "a.md" }),
  ).toBe("research/2026");
  expect(folderIn(undefined, { path: "library/a.md" })).toBe("");
});

test("names another folder and keeps the rest", () => {
  expect(
    withFolder(LINE, { path: "library/a.md", heading: "x" }, "papers"),
  ).toEqual({
    path: "papers/a.md",
    heading: "x",
  });
  expect(withFolder(LINE, {}, "papers")).toEqual({ path: "papers/" });
  expect(withFolder(LINE, { path: "library/a.md" }, "")).toEqual({
    path: "a.md",
  });
  expect(withFolder(LINE, {}, "")).toEqual({});
  expect(withFolder(SPLIT, { directory: "a", filename: "b.md" }, "c")).toEqual({
    directory: "c",
    filename: "b.md",
  });
  expect(withFolder(SPLIT, { directory: "a" }, "")).toEqual({});
});
