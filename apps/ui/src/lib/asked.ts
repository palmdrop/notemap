import type { RoutingTemplate } from "@notemap/client";

import { fieldsOf, type Field } from "./schema-form";

/** One field a template leaves to be supplied each time it is applied. */
export type Asked = {
  readonly field: string;
  /** The template's own word for it, else the schema's, else the field's name. */
  readonly label: string;
  /** What the template's arguments hold for it, which applying it falls back to. */
  readonly default?: string;
};

/**
 * What a template asks for, in the order its capability declares the fields
 * where the schema is at hand, so the steps that ask come in the order a form
 * would draw them: a heading after the note it is a heading of.
 */
export function askedOf(
  template: Pick<RoutingTemplate, "asked" | "arguments">,
  schema?: Record<string, unknown>,
): readonly Asked[] {
  const asked = template.asked ?? {};
  const fields = fieldsOf(schema);
  const declared = fields.map((one) => one.name);
  const order = [
    ...declared.filter((name) => name in asked),
    ...Object.keys(asked).filter((name) => !declared.includes(name)),
  ];

  return order.map((field) => {
    const held = template.arguments[field];
    const title = fields.find((one) => one.name === field)?.title;
    return {
      field,
      label: asked[field]?.label ?? title ?? field,
      ...(typeof held === "string" && held !== "" ? { default: held } : {}),
    };
  });
}

/** A field a person can be asked for: one that holds a string. */
export function askable(field: Field): boolean {
  return field.kind === "text";
}
