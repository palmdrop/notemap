import { ASKABLE_GIVEN_FIELD } from "@notemap/core";
import type { JsonSchema } from "@notemap/core";

import type { DaemonRefusal } from "../types";

const GIVEN = /^given\[(.+)\]$/;

/** `given[path]=…` is how an object travels in a query string, and what a generated client sends. */
export function givenOf(url: string): Readonly<Record<string, string>> {
  const given: Record<string, string> = {};
  for (const [key, value] of new URL(url).searchParams) {
    const name = GIVEN.exec(key)?.[1];
    if (name !== undefined) given[name] = value;
  }
  return given;
}

/**
 * What is wrong with what a request carries for a field, against what that
 * field's schema says its answer depends on: a dependency left empty, or an
 * argument it never said it needs.
 */
export function unmetGiven(
  schema: JsonSchema,
  capability: string,
  field: string,
  given: Readonly<Record<string, string>>,
): DaemonRefusal | undefined {
  const declared = declaredGiven(schema, field);

  const missing = declared.filter((name) => (given[name] ?? "") === "");
  if (missing.length > 0) {
    return { kind: "given-missing", capability, field, missing };
  }

  const undeclared = Object.keys(given).filter(
    (name) => !declared.includes(name),
  );
  if (undeclared.length > 0) {
    return { kind: "given-undeclared", capability, field, undeclared };
  }

  return undefined;
}

function declaredGiven(schema: JsonSchema, field: string): readonly string[] {
  const properties = schema["properties"];
  if (properties === null || typeof properties !== "object") return [];

  const property = (properties as Record<string, unknown>)[field];
  if (property === null || typeof property !== "object") return [];

  const held = (property as Record<string, unknown>)[ASKABLE_GIVEN_FIELD];
  return Array.isArray(held)
    ? held.filter((name): name is string => typeof name === "string")
    : [];
}
