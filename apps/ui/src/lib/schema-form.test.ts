import { describe, expect, test } from "vitest";

import { fieldsOf, typedFrom, valuesFrom } from "./schema-form";

const SCHEMA = {
  type: "object",
  required: ["path"],
  properties: {
    path: {
      type: "string",
      title: "Path",
      description: "Where it goes.",
      "x-notemap-candidates": true,
    },
    tags: { type: "array", items: { type: "string" } },
  },
};

describe("the fields a schema asks for", () => {
  test("names each property, which of them are required, and its shape", () => {
    expect(fieldsOf(SCHEMA)).toEqual([
      {
        name: "path",
        required: true,
        kind: "text",
        title: "Path",
        description: "Where it goes.",
        askable: true,
      },
      { name: "tags", required: false, kind: "list", askable: false },
    ]);
  });

  test("asks for nothing where there is no schema to ask from", () => {
    expect(fieldsOf(undefined)).toEqual([]);
    expect(fieldsOf({ type: "object" })).toEqual([]);
  });
});

describe("what a person typed, as the value the schema asks for", () => {
  const fields = fieldsOf(SCHEMA);

  test("splits a list on commas and drops the space around each", () => {
    expect(valuesFrom(fields, { path: " inbox ", tags: "one, two ," })).toEqual(
      {
        path: "inbox",
        tags: ["one", "two"],
      },
    );
  });

  test("leaves a field nobody filled in absent rather than empty", () => {
    expect(valuesFrom(fields, { path: "inbox", tags: "  " })).toEqual({
      path: "inbox",
    });
  });

  test("puts a value already held back into what an input holds", () => {
    expect(typedFrom({ path: "inbox", tags: ["one", "two"] })).toEqual({
      path: "inbox",
      tags: "one, two",
    });
  });
});
