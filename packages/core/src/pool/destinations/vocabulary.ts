import type { Capability } from "#types/domain/destination";
import type { JsonObject, JsonSchema, JsonValue } from "#types/json";

/**
 * The words notemap itself puts into an adapter's arguments schema, and reads
 * back out of one. Everything else in there is the adapter's own.
 */

/** The argument a folder mode is carried in, which core writes and no adapter names. */
export const FOLDER_ARGUMENT = "folder";

/**
 * The field a folder mode is about: a `/`-separated place whose last segment is
 * the leaf and whose earlier ones are folders. An adapter marks it in its own
 * arguments schema, so core reads what a kind says about itself rather than
 * holding a table keyed on capability names — which is the rule
 * [CONTEXT.md](../../../../../CONTEXT.md) states for capabilities generally.
 */
export const PATH_FIELD = "x-notemap-path";

/** The field a destination can be asked what it could hold, drawn as a browse. */
export const ASKABLE_FIELD = "x-notemap-candidates";

/**
 * Every vendor annotation notemap declares. A validator has to be told about
 * them or reject the schemas carrying them, and a list here is what stops that
 * being a second place to remember: one more annotation is one more line, and
 * a keyword nobody declared still fails loudly, which is what catches a typo in
 * a hand-written `config.toml` payload type.
 */
export const ANNOTATIONS = [ASKABLE_FIELD, PATH_FIELD] as const;

/**
 * The argument field holding a hierarchical path, where the capability declares
 * one. Absent is the ordinary case, not a fault: a board column, a webhook or a
 * mailbox has no folders above it, and nothing about a path is inferred for
 * them.
 *
 * The first marked field wins. A capability marking two has said something with
 * no meaning, and choosing between them would be a guess.
 */
export function pathField(capability: Capability): string | undefined {
  for (const [name, property] of properties(capability.argumentsSchema)) {
    if (property[PATH_FIELD] === true) return name;
  }
  return undefined;
}

function properties(
  schema: JsonSchema,
): readonly (readonly [string, JsonObject])[] {
  const held = object(schema["properties"]);
  if (held === undefined) return [];

  return Object.entries(held).flatMap(([name, property]) => {
    const shape = object(property);
    return shape === undefined ? [] : [[name, shape] as const];
  });
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  if (value === null || value === undefined || typeof value !== "object") {
    return undefined;
  }
  return listed(value) ? undefined : value;
}

/** `Array.isArray` does not narrow a `readonly` array out of a union on its own. */
function listed(value: object): value is readonly JsonValue[] {
  return Array.isArray(value);
}
