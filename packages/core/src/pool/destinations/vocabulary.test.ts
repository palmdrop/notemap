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
    expect(pathFields(marking({ directory: "folders" }))).toStrictEqual({
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
    ["a whole path beside a leaf", { a: true, b: "leaf" }],
    ["a leaf with no folders", { a: "leaf" }],
  ])("is nothing where it marks %s", (_, roles) => {
    expect(pathFields(marking(roles))).toBeUndefined();
  });
});

describe("a capability's path fields, read off a less than well-formed schema", () => {
  it("is nothing where properties itself does not hold an object", () => {
    for (const properties of [null, "oops", []]) {
      expect(
        pathFields(
          fakeCapability({ argumentsSchema: { type: "object", properties } }),
        ),
      ).toBeUndefined();
    }
  });

  it("is nothing where properties is an array rather than an object, even one shaped like a marking", () => {
    expect(
      pathFields(
        fakeCapability({
          argumentsSchema: {
            type: "object",
            properties: [{ type: "string", [PATH_FIELD]: true }],
          },
        }),
      ),
    ).toBeUndefined();
  });

  it("passes over a property whose own shape is not an object, rather than failing on it", () => {
    expect(
      pathFields(
        fakeCapability({
          argumentsSchema: {
            type: "object",
            properties: {
              weird: null,
              path: { type: "string", [PATH_FIELD]: true },
            },
          },
        }),
      ),
    ).toEqual({ kind: "whole", field: "path" });
  });
});
