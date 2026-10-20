import type { Client, RoutingTemplate } from "@notemap/client";

/** One field a chosen trigger tag's template asks for, and what may be given for it. */
export type AskedField = {
  readonly tag: string;
  readonly field: string;
  /** The template's own word for it, else the schema's, else the field's name. */
  readonly label: string;
  /** What the template's arguments hold for it, which an empty answer falls back to. */
  readonly default?: string;
  /** Every value it may take, where the schema fixes the set. */
  readonly closed?: readonly string[];
  /** What the destination holds for it, where it could be asked and answered. */
  readonly listed?: readonly {
    readonly label: string;
    readonly value: string;
  }[];
};

/** By trigger tag, by field: what the form gave for each asked field. */
export type Supplied = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

const PREFIX = "asked:";

/** A form field's id for one tag's one field. JSON, since a tag may hold any character. */
export function fieldId(tag: string, field: string): string {
  return `${PREFIX}${JSON.stringify([tag, field])}`;
}

/**
 * What the form gave, for the tags still chosen and the fields given anything.
 * An empty one is left out, which is the default the pool fills in.
 */
export function suppliedFrom(
  values: Readonly<Record<string, unknown>>,
  tags: readonly string[],
): Supplied {
  const given: Record<string, Record<string, string>> = {};
  for (const [id, value] of Object.entries(values)) {
    if (!id.startsWith(PREFIX) || typeof value !== "string") continue;
    const [tag, field] = JSON.parse(id.slice(PREFIX.length)) as [
      string,
      string,
    ];
    if (!tags.includes(tag) || value.trim() === "") continue;
    given[tag] = { ...given[tag], [field]: value.trim() };
  }
  return given;
}

type Property = Readonly<Record<string, unknown>>;

/**
 * What a template asks for, each field with what the form may offer for it.
 * The destination is asked what its fields are and what one could hold; one
 * that cannot answer leaves every field typed.
 */
export async function askedFor(
  client: Client,
  tag: string,
  template: RoutingTemplate,
): Promise<readonly AskedField[]> {
  const asked = template.asked ?? {};
  const properties = await propertiesOf(client, template);
  const declared = Object.keys(properties);
  const order = [
    ...declared.filter((name) => Object.hasOwn(asked, name)),
    ...Object.keys(asked).filter((name) => !declared.includes(name)),
  ];

  return Promise.all(
    order.map(async (field): Promise<AskedField> => {
      const property = properties[field] ?? {};
      const held = template.arguments[field];
      const title =
        typeof property["title"] === "string" ? property["title"] : undefined;
      const base = {
        tag,
        field,
        label: asked[field]?.label ?? title ?? field,
        ...(typeof held === "string" && held !== "" ? { default: held } : {}),
      };

      const closed = property["enum"];
      if (Array.isArray(closed)) {
        return {
          ...base,
          closed: closed.filter(
            (one): one is string => typeof one === "string",
          ),
        };
      }
      // A place is walked into, folder by folder, and one level of it is no list.
      if (
        property["x-notemap-candidates"] !== true ||
        property["x-notemap-path"] !== undefined
      ) {
        return base;
      }

      const listed = await listing(client, template, field, property);
      return listed === undefined ? base : { ...base, listed };
    }),
  );
}

async function propertiesOf(
  client: Client,
  template: RoutingTemplate,
): Promise<Readonly<Record<string, Property>>> {
  try {
    const described = await client.destinations.describe(template.destination);
    if (described.kind !== "described") return {};
    const schema = described.capabilities.find(
      (one) => one.name === template.capability,
    )?.argumentsSchema;
    const properties = schema?.["properties"];
    return typeof properties === "object" && properties !== null
      ? (properties as Record<string, Property>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Asked with the template's own values for what the field depends on. A
 * pattern names no one note, so a field depending on one is typed.
 */
async function listing(
  client: Client,
  template: RoutingTemplate,
  field: string,
  property: Property,
): Promise<AskedField["listed"] | undefined> {
  const depends = Array.isArray(property["x-notemap-candidates-given"])
    ? (property["x-notemap-candidates-given"] as string[])
    : [];
  const given = Object.fromEntries(
    depends.map((name) => [name, template.arguments[name]]),
  );
  if (
    Object.values(given).some(
      (value) =>
        typeof value !== "string" || value === "" || value.includes("{{"),
    )
  ) {
    return undefined;
  }

  try {
    const answer = await client.destinations.candidates(template.destination, {
      capability: template.capability,
      field,
      ...(depends.length === 0
        ? {}
        : { given: given as Record<string, string> }),
    });
    // An entry holding no value is somewhere to look further, not an answer.
    return answer.kind === "answered"
      ? answer.entries.flatMap(({ label, value }) =>
          value === undefined ? [] : [{ label, value: String(value) }],
        )
      : undefined;
  } catch {
    return undefined;
  }
}
