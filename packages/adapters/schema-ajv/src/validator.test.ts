import type { JsonSchema, JsonValue } from "@notemap/core";
import { describe, expect, it } from "vitest";

import { createAjvSchemaValidator } from "./validator";

/** The `text` payload type as the daemon's example config declares it. */
const TEXT: JsonSchema = {
  type: "object",
  required: ["text"],
  additionalProperties: false,
  properties: { text: { type: "string", minLength: 1 } },
};

function issues(schema: JsonSchema, value: JsonValue) {
  return createAjvSchemaValidator().validate(schema, value);
}

describe("a payload that satisfies its schema", () => {
  it("produces no issues", () => {
    expect(issues(TEXT, { text: "a thought" })).toEqual([]);
  });
});

describe("the issues a refusal carries", () => {
  it("names a missing property by its own path, not its parent's", () => {
    expect(issues(TEXT, {})).toEqual([{ path: "/text", keyword: "required" }]);
  });

  it("names a property of the wrong type", () => {
    expect(issues(TEXT, { text: 7 })).toEqual([
      { path: "/text", keyword: "type" },
    ]);
  });

  it("names a property that broke a constraint", () => {
    expect(issues(TEXT, { text: "" })).toEqual([
      { path: "/text", keyword: "minLength" },
    ]);
  });

  it("names the offending property when the schema forbids extras", () => {
    expect(issues(TEXT, { text: "a thought", colour: "blue" })).toEqual([
      { path: "/colour", keyword: "additionalProperties" },
    ]);
  });

  it("names the value itself when the whole payload is the wrong type", () => {
    expect(issues(TEXT, "a thought")).toEqual([{ path: "", keyword: "type" }]);
  });

  it("reports a nested path in full", () => {
    const nested: JsonSchema = {
      type: "object",
      properties: {
        author: { type: "object", required: ["name"] },
      },
    };

    expect(issues(nested, { author: {} })).toEqual([
      { path: "/author/name", keyword: "required" },
    ]);
  });

  it("reports every issue, not just the first", () => {
    const both: JsonSchema = {
      type: "object",
      required: ["text", "at"],
    };

    expect(issues(both, {})).toEqual([
      { path: "/text", keyword: "required" },
      { path: "/at", keyword: "required" },
    ]);
  });
});

describe("a schema the host got wrong", () => {
  it("throws rather than reporting it as a payload that failed", () => {
    const nonsense = { type: "not-a-json-type" } as unknown as JsonSchema;

    expect(() => issues(nonsense, { text: "a thought" })).toThrow();
  });
});

describe("two validators in one process", () => {
  it("share no compiled schema, so one pool's rules cannot reach another", () => {
    const id = "https://notemap.invalid/text";
    const strict: JsonSchema = { $id: id, type: "object", required: ["text"] };
    const loose: JsonSchema = { $id: id, type: "object" };

    const first = createAjvSchemaValidator();
    const second = createAjvSchemaValidator();

    // A shared ajv would either throw on the second registration of this `$id`
    // or answer with the schema it compiled first.
    expect(first.validate(strict, {})).toEqual([
      { path: "/text", keyword: "required" },
    ]);
    expect(second.validate(loose, {})).toEqual([]);
  });

  it("caches within one instance, so a schema validates the same way twice", () => {
    const validator = createAjvSchemaValidator();

    expect(validator.validate(TEXT, { text: "" })).toEqual([
      { path: "/text", keyword: "minLength" },
    ]);
    expect(validator.validate(TEXT, { text: "" })).toEqual([
      { path: "/text", keyword: "minLength" },
    ]);
  });
});

describe("a vendor keyword this validator does not interpret", () => {
  it("is declared, so a keyword nobody told ajv about still throws", () => {
    const typo: JsonSchema = {
      type: "object",
      properties: {
        directory: { type: "string", "x-notemap-candidate": true },
      },
    };

    expect(() => issues(typo, { directory: "inbox" })).toThrow(
      /unknown keyword/,
    );
  });

  it("is tolerated rather than thrown on", () => {
    const withCandidates: JsonSchema = {
      type: "object",
      properties: {
        directory: { type: "string", "x-notemap-candidates": true },
      },
    };

    expect(issues(withCandidates, { directory: "inbox" })).toEqual([]);
  });

  it("is tolerated where its value is a list of conditions, as declared", () => {
    const conditional: JsonSchema = {
      type: "object",
      properties: {
        hashtags: { type: "boolean" },
        triggerTags: {
          type: "boolean",
          "x-notemap-when": [{ field: "hashtags", is: [true] }],
        },
      },
    };

    expect(issues(conditional, { triggerTags: true })).toEqual([]);
  });

  /** A condition a form cannot read is dropped, and a field with none is offered always. */
  it("throws on a condition that is not the shape declared", () => {
    const malformed = (when: JsonValue): JsonSchema => ({
      type: "object",
      properties: {
        triggerTags: { type: "boolean", "x-notemap-when": when },
      },
    });

    expect(() => issues(malformed(true), {})).toThrow();
    expect(() => issues(malformed([]), {})).toThrow();
    expect(() =>
      issues(malformed([{ fields: "hashtags", is: [true] }]), {}),
    ).toThrow();
    expect(() =>
      issues(malformed([{ field: "hashtags", is: true }]), {}),
    ).toThrow();
  });

  it("is not stripped from the schema object handed in", () => {
    const withCandidates: JsonSchema = {
      type: "object",
      properties: {
        directory: { type: "string", "x-notemap-candidates": true },
      },
    };

    issues(withCandidates, { directory: "inbox" });

    const properties = withCandidates["properties"] as Record<
      string,
      JsonValue
    >;
    const directory = properties["directory"] as Record<string, JsonValue>;
    expect(directory["x-notemap-candidates"]).toBe(true);
  });
});
