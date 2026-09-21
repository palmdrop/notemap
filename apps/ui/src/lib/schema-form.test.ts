import { describe, expect, test } from "vitest";

import {
  effectiveOf,
  fieldsOf,
  impliedOf,
  labelOf,
  OFF,
  offered,
  ON,
  presetsFrom,
  typedFrom,
  valuesFrom,
} from "./schema-form";

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
        inherits: false,
      },
      {
        name: "tags",
        required: false,
        kind: "list",
        askable: false,
        offeredOnly: false,
        inherits: false,
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

  test("sends a flag as a boolean either way, and one nobody said as nothing", () => {
    const flagged = fieldsOf({
      type: "object",
      properties: { whether: { type: "boolean", default: false } },
    });

    expect(flagged[0]?.kind).toBe("flag");
    expect(flagged[0]?.options).toEqual([ON, OFF]);
    expect(valuesFrom(flagged, { whether: ON })).toEqual({ whether: true });
    expect(valuesFrom(flagged, { whether: OFF })).toEqual({ whether: false });
    expect(valuesFrom(flagged, {})).toEqual({});
    expect(typedFrom({ whether: true })).toEqual({ whether: ON });
  });

  test("reads a flag's values as yes and no", () => {
    const [whether] = fieldsOf({
      type: "object",
      properties: { whether: { type: "boolean" } },
    });

    expect(labelOf(whether as never, ON)).toBe("yes");
    expect(labelOf(whether as never, OFF)).toBe("no");
  });

  test("sends a required flag that is off as false", () => {
    const flagged = fieldsOf({
      type: "object",
      required: ["whether"],
      properties: { whether: { type: "boolean" } },
    });

    expect(valuesFrom(flagged, {})).toEqual({ whether: false });
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

describe("what a field starts at", () => {
  test("reads a default as the string an input holds", () => {
    const [directory, tags] = fieldsOf({
      type: "object",
      properties: {
        directory: { type: "string", default: "inbox" },
        tags: {
          type: "array",
          items: { type: "string" },
          default: ["one", "two"],
        },
      },
    });

    expect(directory?.preset).toBe("inbox");
    expect(tags?.preset).toBe("one, two");
  });

  /** The other direction stringifies these, and one form reads two ways is two forms. */
  test("reads a scalar default the way a value arriving would be read", () => {
    const [count, whether] = fieldsOf({
      type: "object",
      properties: {
        count: { type: "integer", default: 30 },
        whether: { type: "boolean", default: false },
      },
    });

    expect(count?.preset).toBe("30");
    expect(whether?.preset).toBe("false");
    expect(typedFrom({ count: 30, whether: false })).toEqual({
      count: "30",
      whether: "false",
    });
  });

  test("says nothing of a field that starts nowhere", () => {
    const [only] = fieldsOf({
      type: "object",
      properties: { directory: { type: "string" } },
    });

    expect(only?.preset).toBeUndefined();
  });

  /** `null` is a field saying it starts at nothing, which is where it starts anyway. */
  test("says nothing of a default that is null or a shape this form cannot draw", () => {
    const [nothing, shape, empty] = fieldsOf({
      type: "object",
      properties: {
        nothing: { type: "string", default: null },
        shape: { type: "object", default: { a: 1 } },
        empty: { type: "array", items: { type: "string" }, default: [] },
      },
    });

    expect(nothing?.preset).toBeUndefined();
    expect(shape?.preset).toBeUndefined();
    expect(empty?.preset).toBeUndefined();
  });

  test("offers the fields that start somewhere, as an input's own values", () => {
    const fields = fieldsOf({
      type: "object",
      properties: {
        directory: { type: "string", default: "inbox" },
        filename: { type: "string" },
      },
    });

    expect(presetsFrom(fields)).toEqual({ directory: "inbox" });
  });
});

describe("what a field comes out as", () => {
  const fields = fieldsOf({
    type: "object",
    properties: {
      frontmatter: {
        type: "string",
        enum: ["full", "none"],
        default: "none",
        "x-notemap-inherits": true,
      },
      hashtags: {
        type: "boolean",
        default: false,
        "x-notemap-inherits": true,
      },
      triggerTags: {
        type: "boolean",
        "x-notemap-when": [
          { field: "frontmatter", is: ["full"] },
          { field: "hashtags", is: [true] },
        ],
      },
    },
  });
  const [, , triggerTags] = fields;

  test("is what was typed, else the setting it inherits, else the default", () => {
    expect(effectiveOf(fields, {}, {})).toEqual({
      frontmatter: "none",
      hashtags: false,
      triggerTags: false,
    });
    expect(effectiveOf(fields, {}, { frontmatter: "full" })).toMatchObject({
      frontmatter: "full",
    });
    expect(
      effectiveOf(fields, { frontmatter: "none" }, { frontmatter: "full" }),
    ).toMatchObject({ frontmatter: "none" });
  });

  test("is never seeded for a field that inherits", () => {
    expect(presetsFrom(fields)).toEqual({});
  });

  test("offers a conditional field only while one of its conditions holds", () => {
    const field = triggerTags as never;

    expect(offered(field, effectiveOf(fields, {}, {}))).toBe(false);
    expect(offered(field, effectiveOf(fields, { hashtags: ON }, {}))).toBe(
      true,
    );
    expect(
      offered(field, effectiveOf(fields, {}, { frontmatter: "full" })),
    ).toBe(true);
    expect(
      offered(
        field,
        effectiveOf(fields, { frontmatter: "none" }, { hashtags: true }),
      ),
    ).toBe(true);
  });

  test("holds a condition where any of its values is met", () => {
    const [, wide] = fieldsOf({
      type: "object",
      properties: {
        mode: { type: "string", enum: ["a", "b", "c"] },
        extra: {
          type: "boolean",
          "x-notemap-when": [{ field: "mode", is: ["a", "b"] }],
        },
      },
    });

    expect(offered(wide as never, { mode: "b" })).toBe(true);
    expect(offered(wide as never, { mode: "c" })).toBe(false);
  });

  /** What a hidden field still holds is not sent, so nothing may be judged by it. */
  test("judges a chained condition as if the hidden field held nothing", () => {
    const chained = fieldsOf({
      type: "object",
      properties: {
        hashtags: { type: "boolean" },
        triggerTags: {
          type: "boolean",
          "x-notemap-when": [{ field: "hashtags", is: [true] }],
        },
        onlyThese: {
          type: "string",
          "x-notemap-when": [{ field: "triggerTags", is: [true] }],
        },
      },
    });
    const [, , onlyThese] = chained;

    expect(
      offered(
        onlyThese as never,
        effectiveOf(chained, { hashtags: ON, triggerTags: ON }),
      ),
    ).toBe(true);
    expect(
      offered(
        onlyThese as never,
        effectiveOf(chained, { hashtags: OFF, triggerTags: ON }),
      ),
    ).toBe(false);
  });

  test("always offers a field with no condition", () => {
    expect(offered(fields[0] as never, {})).toBe(true);
  });

  test("says what an untouched field would come out as, in an input's own words", () => {
    expect(impliedOf(fields[0] as never)).toBe("none");
    expect(impliedOf(fields[0] as never, { frontmatter: "full" })).toBe("full");
    expect(impliedOf(fields[1] as never, { hashtags: true })).toBe(ON);
    expect(impliedOf(triggerTags as never)).toBe(OFF);
  });
});
