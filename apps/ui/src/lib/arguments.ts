import { fieldsOf } from "./schema-form";

/**
 * The argument names notemap defines rather than a destination. They are drawn
 * as their own control — a folder mode is `create · require · establish` on a
 * form, not a place typed into one — so they are never part of the place a
 * person reads off a row. Everything else in an arguments object is the
 * destination's own, and is drawn without this shell knowing what it means.
 *
 * The client is built against the wire and does not import core, so the word is
 * repeated here rather than shared. It is one word, and this shell already has
 * to know it to draw the control.
 */
export const OWN_ARGUMENTS: readonly string[] = ["folder"];

/** One argument a delivery was given, under whatever name a reader can be offered. */
export type Argument = {
  readonly name: string;
  readonly said: string;
};

function written(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.map((each) => written(each)).join(", ");
  return JSON.stringify(value) ?? "";
}

/**
 * What a delivery was given, in the capability's own words where the
 * destination could be described. The schema names the fields and their order;
 * anything the record carries that the schema does not know is drawn after it
 * under its own key, the record being what happened and the schema only what
 * is offered now.
 */
export function argumentsOf(
  values: Record<string, unknown>,
  schema: Record<string, unknown> | undefined,
): readonly Argument[] {
  const fields = fieldsOf(schema);
  const named = fields
    .filter((field) => field.name in values)
    .map((field) => ({
      name: field.title ?? field.name,
      said: written(values[field.name]),
    }));

  const rest = Object.entries(values)
    .filter(([key]) => !fields.some((field) => field.name === key))
    .map(([key, value]) => ({ name: key, said: written(value) }));

  return [...named, ...rest];
}
