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
 * The field that may hold only something the destination already has: an
 * are.na channel, a board's column, a mailbox. It is the opposite of a vault's
 * folder, which a delivery makes where it is not there yet, and the difference
 * is not one anything can infer — both are askable, and both take a string.
 *
 * Core never reads it. It is said for the surfaces: a value that has to name
 * something already there cannot be **expanded into**, so a form offering a
 * pattern beside one is offering advice that can only ever fail.
 */
export const OFFERED_ONLY_FIELD = "x-notemap-offered-only";

/**
 * The argument that, left absent, takes the destination's setting of the same
 * name. Core never reads it: an adapter already resolves its own arguments
 * against its own settings, and this says so to a surface, so a form can draw
 * what an untouched field comes out as instead of a blank.
 */
export const INHERITS_FIELD = "x-notemap-inherits";

/**
 * The field that is offered only while another field's value makes it mean
 * something: a list of `{ field, is }`, any one of which holding is enough.
 * Judged against what each field comes out as — typed, else inherited, else
 * the schema's default — so a person is never offered a choice that changes
 * nothing. Core never reads it; a combination it would forbid is the schema's
 * to forbid.
 */
export const OFFERED_WHEN_FIELD = "x-notemap-when";

const FLAG: JsonSchema = { type: "boolean" };

/**
 * One condition per entry, and every entry whole: a form drops an entry it
 * cannot read, and a field whose every entry was dropped would be offered
 * always — the one thing the annotation exists to prevent.
 */
const CONDITIONS: JsonSchema = {
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    required: ["field", "is"],
    additionalProperties: false,
    properties: {
      field: { type: "string", minLength: 1 },
      is: { type: "array", minItems: 1 },
    },
  },
};

/**
 * Every vendor annotation notemap declares, each with the schema its own value
 * must satisfy. A validator has to be told about them or reject the schemas
 * carrying them, and a list here is what stops that being a second place to
 * remember: one more annotation is one more line, and a keyword nobody
 * declared — or a value that is not the shape declared here — still fails
 * loudly, which is what catches a typo in a hand-written `config.toml` payload
 * type.
 */
export const ANNOTATIONS: readonly {
  readonly keyword: string;
  readonly value: JsonSchema;
}[] = [
  { keyword: ASKABLE_FIELD, value: FLAG },
  { keyword: INHERITS_FIELD, value: FLAG },
  { keyword: OFFERED_ONLY_FIELD, value: FLAG },
  { keyword: OFFERED_WHEN_FIELD, value: CONDITIONS },
  { keyword: PATH_FIELD, value: FLAG },
];

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
