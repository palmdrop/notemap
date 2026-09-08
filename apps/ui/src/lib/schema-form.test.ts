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
        offeredOnly: false,
      },
      {
        name: "tags",
        required: false,
        kind: "list",
        askable: false,
        offeredOnly: false,
      },
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

  /**
   * The folder field of a filesystem destination is required and means the root
   * when it is empty. Dropping it left the schema refusing it as missing, so
   * routing into the root was a thing the form could describe and not do.
   */
  test("sends a required field somebody left blank, since blank is a value there", () => {
    expect(valuesFrom(fields, { path: "  ", tags: "one" })).toEqual({
      path: "",
      tags: ["one"],
    });
  });

  test("sends a required list left blank as no items rather than as nothing", () => {
    const required = fieldsOf({
      type: "object",
      required: ["tags"],
      properties: { tags: { type: "array", items: { type: "string" } } },
    });

    expect(valuesFrom(required, { tags: " " })).toEqual({ tags: [] });
  });

  test("puts a value already held back into what an input holds", () => {
    expect(typedFrom({ path: "inbox", tags: ["one", "two"] })).toEqual({
      path: "inbox",
      tags: "one, two",
    });
  });
});

/** A channel is joined, not made, so a pattern expanded into one names nothing. */
test("reads a field that may hold only what its destination already has", () => {
  const [only] = fieldsOf({
    type: "object",
    properties: {
      channel: {
        type: "string",
        "x-notemap-candidates": true,
        "x-notemap-offered-only": true,
      },
    },
  });

  expect(only).toMatchObject({ askable: true, offeredOnly: true });
});
