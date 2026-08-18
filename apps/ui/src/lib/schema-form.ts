/**
 * A form from a JSON Schema, for the two shapes notemap's schemas actually use:
 * a string, and a list of strings. Anything else is offered as a string and
 * sent as one, which the pool then refuses with the reason — better than
 * hiding a field a person has no other way to fill in.
 */
export type Field = {
  readonly name: string;
  readonly required: boolean;
  readonly kind: "text" | "list";
};

type Schema = Record<string, unknown> | undefined;

export function fieldsOf(schema: Schema): readonly Field[] {
  const properties = schema?.["properties"];
  if (properties === null || typeof properties !== "object") return [];

  const required = Array.isArray(schema?.["required"])
    ? (schema["required"] as unknown[])
    : [];

  return Object.entries(properties as Record<string, unknown>).map(
    ([name, property]) => ({
      name,
      required: required.includes(name),
      kind: kindOf(property),
    }),
  );
}

function kindOf(property: unknown): Field["kind"] {
  const type = (property as Record<string, unknown> | null)?.["type"];
  return type === "array" ? "list" : "text";
}

/** What a person typed, as the value the schema asks for. Empty fields are absent. */
export function valuesFrom(
  fields: readonly Field[],
  typed: Record<string, string>,
): Record<string, unknown> {
  const filled: Record<string, unknown> = {};

  for (const field of fields) {
    const value = (typed[field.name] ?? "").trim();
    if (value === "") continue;

    filled[field.name] =
      field.kind === "list"
        ? value
            .split(",")
            .map((each) => each.trim())
            .filter((each) => each !== "")
        : value;
  }

  return filled;
}

/**
 * The other direction: values a person already has, back into what an input
 * holds. Keyed by what is there rather than by the fields, so a value under a
 * key the schema has since dropped is still shown rather than silently lost.
 */
export function typedFrom(
  values: Record<string, unknown> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values ?? {}).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? value.map((each) => String(each)).join(", ")
        : String(value),
    ]),
  );
}
