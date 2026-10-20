import type { CandidateEntry, RoutingTemplate } from "@notemap/client";

import { client } from "./client";
import { capabilityHeld, described } from "./described.svelte";
import { fieldsOf, type Field } from "./schema-form";
import { triggeredBy } from "./templates";

/** One field a template leaves to be supplied each time it is applied. */
export type Asked = {
  readonly field: string;
  /** The template's own word for it, else the schema's, else the field's name. */
  readonly label: string;
  /** What the template's arguments hold for it, which applying it falls back to. */
  readonly default?: string;
};

/** Values for what a template asks, by field. */
export type Supplied = Readonly<Record<string, string>>;

/**
 * One field to ask for, and where its values come from. `closed` is the whole
 * of what may be taken; `listed` is what the destination holds, offered beside
 * whatever is typed, asked with what the field depends on as the earlier steps
 * gave it. Neither, and the field is typed.
 */
export type Step = Asked & {
  readonly closed?: readonly string[];
  readonly listed?: (earlier: Supplied) => Promise<readonly CandidateEntry[]>;
};

/** What taking a trigger tag asks before the tag can land. */
export type Ask = {
  readonly template: string;
  readonly steps: readonly Step[];
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
    ...declared.filter((name) => Object.hasOwn(asked, name)),
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

/**
 * `askFor`, for a chooser: nothing at once where the tag's template asks
 * nothing, so an ordinary tag lands on the keystroke rather than a tick later.
 */
export function askingFor(tag: string): Promise<Ask | undefined> | undefined {
  const asked = triggeredBy(tag)?.asked;
  return asked === undefined || Object.keys(asked).length === 0
    ? undefined
    : askFor(tag);
}

/**
 * What a carried tag's values say, label then value, for a capture that has
 * not gone yet: a value left out reads as the default it will take.
 */
export function saidFor(
  tag: string,
  values: Supplied | undefined,
): string | undefined {
  const template = triggeredBy(tag);
  if (template?.asked === undefined) return undefined;
  const said = askedOf(
    template,
    capabilityHeld(template.destination, template.capability)?.argumentsSchema,
  ).flatMap((asked) => {
    const value = values?.[asked.field] ?? asked.default;
    return value === undefined || value === ""
      ? []
      : [`${asked.label} ${value}`];
  });
  return said.length === 0 ? undefined : said.join(", ");
}

/** Long enough for a destination that answers, short enough that one asleep does not hold a tag back. */
const DESCRIBING = 2_000;

/**
 * What a trigger tag asks before it can land, where its template asks
 * anything. The schema says which fields are lists, so the destination is
 * described first, briefly: one that cannot answer leaves every field typed.
 */
export async function askFor(tag: string): Promise<Ask | undefined> {
  const template = triggeredBy(tag);
  if (template === undefined || template.asked === undefined) return undefined;
  if (Object.keys(template.asked).length === 0) return undefined;

  await Promise.race([
    described(template.destination),
    new Promise((settle) => setTimeout(settle, DESCRIBING)),
  ]);
  const schema = capabilityHeld(
    template.destination,
    template.capability,
  )?.argumentsSchema;
  const fields = fieldsOf(schema);

  return {
    template: template.name,
    steps: askedOf(template, schema).map((asked) => {
      const field = fields.find((one) => one.name === asked.field);
      if (field?.options !== undefined) {
        return { ...asked, closed: field.options };
      }
      // A place is walked into, folder by folder, and one level of it is no list.
      const listed =
        field?.listable === true && field.path === undefined
          ? listing(template, field)
          : undefined;
      return listed === undefined ? asked : { ...asked, listed };
    }),
  };
}

/**
 * What the destination holds for a field, asked with what it depends on: a
 * value given in an earlier step, else the template's own. A pattern names no
 * one place to ask about, so a field depending on one is typed.
 */
function listing(
  template: RoutingTemplate,
  field: Field,
): Step["listed"] | undefined {
  const fixed = (name: string): string | undefined => {
    const held = template.arguments[name];
    return typeof held === "string" && !held.includes("{{") ? held : undefined;
  };
  const depends = field.given ?? [];
  if (
    depends.some(
      (name) =>
        !Object.hasOwn(template.asked ?? {}, name) && fixed(name) === undefined,
    )
  ) {
    return undefined;
  }

  return async (earlier) => {
    const given = Object.fromEntries(
      depends.map((name) => [name, earlier[name] ?? fixed(name) ?? ""]),
    );
    if (Object.values(given).some((value) => value === "")) return [];

    const answer = await client.destinations.candidates(template.destination, {
      capability: template.capability,
      field: field.name,
      ...(depends.length === 0 ? {} : { given }),
    });
    // An entry holding no value is somewhere to look further, not an answer.
    return answer.kind === "answered"
      ? answer.entries.filter((entry) => entry.value !== undefined)
      : [];
  };
}

/**
 * Where a template's asked arguments put this delivery, label then value, as
 * the status line says it after the template's name. Nothing where it asks
 * nothing or nothing was given.
 */
export function whereOf(
  template: string,
  values: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  const held = client.templates.held.find((one) => one.id === template);
  if (held === undefined || values === undefined) return undefined;

  const said = askedOf(
    held,
    capabilityHeld(held.destination, held.capability)?.argumentsSchema,
  ).flatMap((asked) => {
    const value = values[asked.field];
    return typeof value === "string" && value !== ""
      ? [`${asked.label} ${value}`]
      : [];
  });
  return said.length === 0 ? undefined : said.join(", ");
}
