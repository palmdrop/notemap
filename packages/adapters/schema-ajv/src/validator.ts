import { Ajv2020, type ErrorObject, type Options } from "ajv/dist/2020.js";

import type {
  JsonSchema,
  JsonValue,
  SchemaIssue,
  SchemaValidator,
} from "@notemap/core";

export type AjvSchemaValidatorConfig = {
  /**
   * Passed through to ajv. `allErrors` is forced on: core's `payload-invalid`
   * carries every issue, and ajv stops at the first without it.
   */
  readonly options?: Omit<Options, "allErrors">;
};

/**
 * Core's `SchemaValidator` over ajv, on the **2020-12** dialect — the one
 * OpenAPI 3.1 uses, so a payload type's schema and the served API description
 * speak the same JSON Schema rather than two that differ in the corners.
 *
 * No `close()`: it holds nothing open.
 */
export function createAjvSchemaValidator(
  config: AjvSchemaValidatorConfig = {},
): SchemaValidator {
  /**
   * Per instance, never module-level. Two pools may configure one payload type
   * name with different schemas, and ajv caches compiled schemas by `$id` — a
   * shared instance would hand one pool's rules to the other, or throw on the
   * second registration of an id.
   */
  const ajv = new Ajv2020({ ...config.options, allErrors: true });

  return {
    validate(schema: JsonSchema, value: JsonValue): readonly SchemaIssue[] {
      // A schema ajv cannot compile is a configuration mistake, not a payload
      // that failed validation, and throwing is how the host hears about it.
      if (ajv.validate(schema, value)) return [];
      return (ajv.errors ?? []).map(toIssue);
    },
  };
}

/**
 * `instancePath` names the value that was checked, which for a missing or
 * forbidden property is its parent — so those two keywords name the property
 * from `params` instead. Everything ajv reports beyond the path and the
 * keyword is dropped: a refusal carries facts, and which rule failed where is
 * the fact core states.
 */
function toIssue(error: ErrorObject): SchemaIssue {
  const { instancePath, keyword, params } = error;

  if (keyword === "required" && typeof params.missingProperty === "string") {
    return { path: `${instancePath}/${params.missingProperty}`, keyword };
  }

  if (
    keyword === "additionalProperties" &&
    typeof params.additionalProperty === "string"
  ) {
    return { path: `${instancePath}/${params.additionalProperty}`, keyword };
  }

  return { path: instancePath, keyword };
}
