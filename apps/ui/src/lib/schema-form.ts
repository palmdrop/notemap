/**
 * A form from a JSON Schema, for the two shapes a settings schema may take: a
 * string and a list of strings. Anything else is offered as a string, which the
 * pool then refuses with the reason rather than the field being hidden.
 */
export type Field = {
  readonly name: string;
  readonly required: boolean;
  readonly kind: "text" | "list";
  readonly title?: string;
  readonly description?: string;
  /** Carries `x-notemap-candidates`: a destination can be asked what it could hold. */
  readonly askable: boolean;
};

type Schema = Record<string, unknown> | undefined;

function propertyOf(property: unknown): Record<string, unknown> {
  return property !== null && typeof property === "object"
    ? (property as Record<string, unknown>)
    : {};
}

export function fieldsOf(schema: Schema): readonly Field[] {
  const properties = schema?.["properties"];
  if (properties === null || typeof properties !== "object") return [];

  const required = Array.isArray(schema?.["required"])
    ? (schema["required"] as unknown[])
    : [];

  return Object.entries(properties as Record<string, unknown>).map(
    ([name, property]) => {
      const meta = propertyOf(property);
      return {
        name,
        required: required.includes(name),
        kind: kindOf(property),
        ...(typeof meta["title"] === "string" ? { title: meta["title"] } : {}),
        ...(typeof meta["description"] === "string"
          ? { description: meta["description"] }
          : {}),
        askable: meta["x-notemap-candidates"] === true,
      };
    },
  );
}

function kindOf(property: unknown): Field["kind"] {
  const type = (property as Record<string, unknown> | null)?.["type"];
  return type === "array" ? "list" : "text";
}

/**
 * What a person typed, as the value the schema asks for. A field nobody filled
 * in is absent — except a **required** one, which is sent empty: blank is a
 * value there rather than an omission, and it is the one a folder field means
 * by it. A filesystem destination's `directory` says so in as many words, and
 * dropping it made "empty names the root itself" a thing the form could not do.
 */
export function valuesFrom(
  fields: readonly Field[],
  typed: Record<string, string>,
): Record<string, unknown> {
  const filled: Record<string, unknown> = {};

  for (const field of fields) {
    const value = (typed[field.name] ?? "").trim();
    if (value === "" && !field.required) continue;

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

/** The other direction: values a person already has, back into what an input holds. */
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
