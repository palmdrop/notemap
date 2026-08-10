import type { z } from "zod";

import type { SchemaIssue } from "@notemap/core";

function pointer(path: readonly PropertyKey[]): string {
  return path.length === 0 ? "" : `/${path.map(String).join("/")}`;
}

/**
 * Zod reports a missing property and a wrongly typed one under one code and
 * does not carry the value it saw, so the body is the only thing that can tell
 * them apart.
 */
function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = root;
  for (const step of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<PropertyKey, unknown>)[step];
  }
  return current;
}

/** JSON Schema's vocabulary where one applies, so `400` and `422` speak alike. */
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
      return "format";
    default:
      return issue.code;
  }
}

export function toSchemaIssues(
  issues: readonly z.core.$ZodIssue[],
  input: unknown,
): readonly SchemaIssue[] {
  return issues.flatMap((issue): SchemaIssue[] => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key: PropertyKey) => ({
        path: pointer([...issue.path, key]),
        keyword: "additionalProperties",
      }));
    }

    return [{ path: pointer(issue.path), keyword: keywordOf(issue, input) }];
  });
}
