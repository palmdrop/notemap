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
  /**
   * Carries `x-notemap-inherits`: left absent, the argument takes the
   * destination's setting of the same name. What the form draws for an
   * untouched field is then that setting, and the schema's own default is
   * what the setting means where it too is absent — never a value to seed.
   */
  readonly inherits: boolean;
  /**
   * Carries `x-notemap-when`: the field is offered only while one of these
   * holds, judged against what each named field comes out as.
   */
  readonly when?: readonly Condition[];
  /** Offered as a list rather than typed. Annotation only: these constrain nothing. */
  readonly examples?: readonly string[];
  /**
   * What the destination says the field starts at, in the form an input holds.
   * A suggestion the person may write over, never a value the request carries
   * on its own: an untouched field is still absent unless it is required.
   */
  readonly preset?: string;
  /** The same, as the schema wrote it. */
  readonly fallback?: unknown;
  /**
   * The values the schema actually allows. Unlike `examples` these **are** the
   * field: a destination whose places are a fixed set — a board's columns, a
   * mailbox — says so here, and typing one from memory is not something to ask
   * of anybody. A flag's are `yes` and `no`, held as `true` and `false`.
   */
  readonly options?: readonly string[];
};

export type Condition = {
  readonly field: string;
  readonly is: readonly unknown[];
};

/** What an input holds for a flag that is on, and for one that is off. */
export const ON = "true";
export const OFF = "false";

/** Every value a field may come out as, by name: what the form judges conditions against. */
export type Effective = Readonly<Record<string, unknown>>;

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
      const kind = kindOf(property);
      const examples = examplesOf(meta);
      const options = kind === "flag" ? [ON, OFF] : stringsAt(meta, "enum");
      const preset = presetOf(meta);
      const when = conditionsOf(meta["x-notemap-when"]);
      return {
        name,
        required: required.includes(name),
        kind,
        ...(options === undefined ? {} : { options }),
        ...(typeof meta["title"] === "string" ? { title: meta["title"] } : {}),
        ...(typeof meta["description"] === "string"
          ? { description: meta["description"] }
          : {}),
        ...(preset === undefined ? {} : { preset, fallback: meta["default"] }),
        askable: meta["x-notemap-candidates"] === true,
        offeredOnly: meta["x-notemap-offered-only"] === true,
        inherits: meta["x-notemap-inherits"] === true,
        ...(when === undefined ? {} : { when }),
        ...(examples === undefined ? {} : { examples }),
      };
    },
  );
}

function conditionsOf(held: unknown): readonly Condition[] | undefined {
  if (!Array.isArray(held)) return undefined;

  const conditions = held.flatMap((each): Condition[] => {
    const shape = propertyOf(each);
    return typeof shape["field"] === "string" && Array.isArray(shape["is"])
      ? [{ field: shape["field"], is: shape["is"] as unknown[] }]
      : [];
  });
  return conditions.length === 0 ? undefined : conditions;
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

/**
 * The fields that start at something, as an input's own values. An inheriting
 * field starts at the destination's setting, which is not the form's to write
 * in, so it is left alone.
 */
export function presetsFrom(fields: readonly Field[]): Record<string, string> {
  return Object.fromEntries(
    fields.flatMap((field) =>
      field.preset === undefined || field.inherits
        ? []
        : [[field.name, field.preset]],
    ),
  );
}

/**
 * What every field comes out as: what was typed, else the destination's
 * setting where the field inherits one, else the schema's default. A flag
 * nobody said anything about is off. Resolved in the schema's order, and a
 * field that is not offered comes out as if nothing were typed in it — what
 * it still holds is not sent, so nothing downstream may be judged by it.
 */
export function effectiveOf(
  fields: readonly Field[],
  typed: Readonly<Record<string, string>>,
  inherited: Readonly<Record<string, unknown>> = {},
): Effective {
  const effective: Record<string, unknown> = {};
  for (const field of fields) {
    effective[field.name] = comesOutAs(
      field,
      offered(field, effective) ? typed : {},
      inherited,
    );
  }
  return effective;
}

function comesOutAs(
  field: Field,
  typed: Readonly<Record<string, string>>,
  inherited: Readonly<Record<string, unknown>>,
): unknown {
  const said = valuesFrom([field], typed)[field.name];
  if (said !== undefined) return said;
  if (field.inherits && inherited[field.name] !== undefined) {
    return inherited[field.name];
  }
  if (field.fallback !== undefined) return field.fallback;
  return field.kind === "flag" ? false : undefined;
}

/** Whether a field is offered at all, given what the others come out as. */
export function offered(field: Field, effective: Effective): boolean {
  return (
    field.when === undefined ||
    field.when.some((condition) =>
      condition.is.some((value) => same(value, effective[condition.field])),
    )
  );
}

function same(one: unknown, other: unknown): boolean {
  return JSON.stringify(one) === JSON.stringify(other);
}

/**
 * What an untouched field would come out as, in the form an input holds, so
 * a form can mark it without anybody having chosen it. Nothing, where nothing
 * says.
 */
export function impliedOf(
  field: Field,
  inherited: Readonly<Record<string, unknown>> = {},
): string | undefined {
  const value = comesOutAs(field, {}, inherited);
  return value === undefined ? undefined : typedValue(value);
}

/** A flag's values under the words a person reads; anything else is its own word. */
export function labelOf(field: Field, value: string): string {
  if (field.kind !== "flag") return value;
  return value === ON ? "yes" : "no";
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

/**
 * What a person typed, as the value the schema asks for. A field nobody filled
 * in is absent — except a **required** one, which is sent empty: blank is a
 * value there rather than an omission, and it is the one a folder field means
 * by it. A filesystem destination's `directory` says so in as many words, and
 * dropping it made "empty names the root itself" a thing the form could not do.
 * A flag holds `true`, `false` or nothing, and nothing is absent on the same
 * terms — off is a thing a person says, not what silence means.
 */
export function valuesFrom(
  fields: readonly Field[],
  typed: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const filled: Record<string, unknown> = {};

  for (const field of fields) {
    const value = (typed[field.name] ?? "").trim();
    if (field.kind === "flag") {
      if (value === ON || value === OFF) filled[field.name] = value === ON;
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
