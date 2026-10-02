import { describe, expect, it } from "vitest";

import { fakeCapability } from "#testing/destination";
import type { JsonValue } from "#types/json";

import { PATH_FIELD, pathFields } from "./vocabulary";

const marking = (roles: Record<string, JsonValue>) =>
  fakeCapability({
    argumentsSchema: {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(roles).map(([name, role]) => [
          name,
          { type: "string", [PATH_FIELD]: role },
        ]),
      ),
    },
  });

describe("the fields a capability's path is held in", () => {
  it("is one field where it marks the whole path", () => {
    expect(pathFields(marking({ path: true }))).toEqual({
      kind: "whole",
      field: "path",
    });
  });

  it("is folders and a leaf where it splits the path", () => {
    expect(
      pathFields(marking({ directory: "folders", filename: "leaf" })),
    ).toEqual({ kind: "split", folders: "directory", leaf: "filename" });
  });

  it("is folders alone where no field completes them", () => {
    expect(pathFields(marking({ directory: "folders" }))).toEqual({
      kind: "split",
      folders: "directory",
    });
  });

  it("is nothing where nothing is marked", () => {
    expect(pathFields(fakeCapability())).toBeUndefined();
  });

  it.each([
    ["two whole paths", { a: true, b: true }],
    ["two folders fields", { a: "folders", b: "folders" }],
    ["two leaves", { a: "folders", b: "leaf", c: "leaf" }],
    ["a whole path beside a split one", { a: true, b: "folders" }],
    ["a leaf with no folders", { a: "leaf" }],
  ])("is nothing where it marks %s", (_, roles) => {
    expect(pathFields(marking(roles))).toBeUndefined();
  });
});
