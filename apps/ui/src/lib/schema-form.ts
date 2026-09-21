/**
 * A form from a JSON Schema, for the three shapes a schema may take: a string,
 * a list of strings, and a flag. Anything else is offered as a string, which
 * the pool then refuses with the reason rather than the field being hidden.
 */
export type Field = {
  readonly name: string;
  readonly required: boolean;
  readonly kind: "text" | "list" | "flag";
  readonly title?: string;
  readonly description?: string;
  /** Carries `x-notemap-candidates`: a destination can be asked what it could hold. */
  readonly askable: boolean;
  /**
   * Carries `x-notemap-offered-only`: the field may hold only something the
   * destination already has. A channel is joined, a mailbox is subscribed to —
   * where a vault's folder is made by the delivery that needs it. So a pattern
   * expanded into one could only ever name something that is not there.
   */
  readonly offeredOnly: boolean;
  /** Offered as a list rather than typed. Annotation only: these constrain nothing. */
  readonly examples?: readonly string[];
  /**
   * What the destination says the field starts at, in the form an input holds.
   * A suggestion the person may write over, never a value the request carries
   * on its own: an untouched field is still absent unless it is required.
   */
  readonly preset?: string;
  /**
   * The values the schema actually allows. Unlike `examples` these **are** the
   * field: a destination whose places are a fixed set — a board's columns, a
   * mailbox — says so here, and typing one from memory is not something to ask
   * of anybody.
   */
  readonly options?: readonly string[];
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
      const examples = examplesOf(meta);
      const options = stringsAt(meta, "enum");
      const preset = presetOf(meta);
      return {
        name,
        required: required.includes(name),
        kind: kindOf(property),
        ...(options === undefined ? {} : { options }),
        ...(typeof meta["title"] === "string" ? { title: meta["title"] } : {}),
        ...(typeof meta["description"] === "string"
          ? { description: meta["description"] }
          : {}),
        ...(preset === undefined ? {} : { preset }),
        askable: meta["x-notemap-candidates"] === true,
        offeredOnly: meta["x-notemap-offered-only"] === true,
        ...(examples === undefined ? {} : { examples }),
      };
    },
  );
}

/**
 * A schema's `default`, as the string an input holds — the same reading
 * `typedFrom` gives a value that arrives from the other direction, so a field
 * starting at `30` and a template holding `30` draw the one string. `null` is
 * not a value a field starts at, and an object is not a shape this form draws.
 */
function presetOf(meta: Record<string, unknown>): string | undefined {
  const held = meta["default"];
  if (held === undefined || held === null) return undefined;
  if (Array.isArray(held)) {
    return held.length === 0 ? undefined : typedValue(held);
  }
  return typeof held === "object" ? undefined : typedValue(held);
}

/** The fields that start at something, as an input's own values. */
export function presetsFrom(fields: readonly Field[]): Record<string, string> {
  return Object.fromEntries(
    fields.flatMap((field) =>
      field.preset === undefined ? [] : [[field.name, field.preset]],
    ),
  );
}

function examplesOf(
  meta: Record<string, unknown>,
): readonly string[] | undefined {
  return stringsAt(meta, "examples");
}

function stringsAt(
  meta: Record<string, unknown>,
  key: string,
): readonly string[] | undefined {
  const held = meta[key];
  if (!Array.isArray(held)) return undefined;

  const strings = held.filter(
    (each): each is string => typeof each === "string",
  );
  return strings.length === 0 ? undefined : strings;
}

function kindOf(property: unknown): Field["kind"] {
  const type = (property as Record<string, unknown> | null)?.["type"];
  if (type === "array") return "list";
  return type === "boolean" ? "flag" : "text";
}

/** What an input holds for a flag that is on; anything else is off. */
export const ON = "true";

/**
 * What a person typed, as the value the schema asks for. A field nobody filled
 * in is absent — except a **required** one, which is sent empty: blank is a
 * value there rather than an omission, and it is the one a folder field means
 * by it. A filesystem destination's `directory` says so in as many words, and
 * dropping it made "empty names the root itself" a thing the form could not do.
 * A flag that is off is absent on the same terms, off being what absent means.
 */
export function valuesFrom(
  fields: readonly Field[],
  typed: Record<string, string>,
): Record<string, unknown> {
  const filled: Record<string, unknown> = {};

  for (const field of fields) {
    const value = (typed[field.name] ?? "").trim();
    if (field.kind === "flag") {
      if (value === ON) filled[field.name] = true;
      else if (field.required) filled[field.name] = false;
      continue;
    }
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
      typedValue(value),
    ]),
  );
}

/** One value as an input holds it, a list joined the way the form reads one back. */
function typedValue(value: unknown): string {
  return Array.isArray(value)
    ? value.map((each) => String(each)).join(", ")
    : String(value);
}
