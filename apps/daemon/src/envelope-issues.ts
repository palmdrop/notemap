import type { z } from "@hono/zod-openapi";

import type { SchemaIssue } from "@notemap/core";

/**
 * A JSON Pointer, which is what an issue's path is everywhere else in this API:
 * `payload-invalid` comes from a JSON Schema validator and reports one.
 */
function pointer(path: readonly PropertyKey[]): string {
  return path.length === 0 ? "" : `/${path.map(String).join("/")}`;
}

/**
 * The value an issue is about, read back out of the body. Zod reports a missing
 * property and a wrongly typed one under one code and does not carry the value
 * it saw, so the body is the only thing that can tell the two apart — and
 * "required" is much the more useful of the two to be told.
 */
function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = root;
  for (const step of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<PropertyKey, unknown>)[step];
  }
  return current;
}

/**
 * Zod's name for a rule, translated to JSON Schema's where one exists, so a
 * client reading `issues` off a `400` and off a `422` reads one vocabulary.
 * Anything without an equivalent keeps zod's own code rather than being forced
 * into an approximate keyword.
 */
function keywordOf(issue: z.core.$ZodIssue, input: unknown): string {
  switch (issue.code) {
    case "invalid_type":
      return valueAt(input, issue.path) === undefined ? "required" : "type";
    case "unrecognized_keys":
      return "additionalProperties";
    case "too_small":
      return issue.origin === "string"
        ? "minLength"
        : issue.origin === "array"
          ? "minItems"
          : "minimum";
    case "too_big":
      return issue.origin === "string"
        ? "maxLength"
        : issue.origin === "array"
          ? "maxItems"
          : "maximum";
    case "invalid_value":
      return "enum";
    case "invalid_format":
      return "format";
    case "invalid_union":
      return "anyOf";
    default:
      return issue.code;
  }
}

export function toSchemaIssues(
  issues: readonly z.core.$ZodIssue[],
  input: unknown,
): readonly SchemaIssue[] {
  return issues.flatMap((issue): SchemaIssue[] => {
    // An unrecognized key is reported against the object holding it; naming the
    // key itself is what makes the path point at what is actually wrong.
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key: PropertyKey) => ({
        path: pointer([...issue.path, key]),
        keyword: "additionalProperties",
      }));
    }

    return [{ path: pointer(issue.path), keyword: keywordOf(issue, input) }];
  });
}
