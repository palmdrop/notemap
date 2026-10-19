import type { Http } from "./http.ts";
import type { Destinations, Template, Templates } from "./types.ts";

type Json = Readonly<Record<string, unknown>>;

const FOLDERS = ["create", "require", "establish"] as const;
type Folder = (typeof FOLDERS)[number];

/** A destination as `POST /v1/destinations` takes one. Matched by name, so seeding twice makes it once. */
export type FixtureDestination = {
  readonly name: string;
  readonly kind: string;
  readonly settings: Json;
};

/** A routing template, naming its destination by the fixture's name for it. */
export type FixtureTemplate = {
  readonly name: string;
  readonly destination: string;
  readonly capability: string;
  readonly arguments: Json;
  readonly folder?: Folder;
  /** Fields left to be supplied each time it is applied, by name, as `/v1/templates` takes them. */
  readonly asked?: Json;
  /** Seed captures one item carrying this tag, which is what routes it. */
  readonly triggerTag: string;
  /** What that capture gives for the fields the template asks, where it asks any. */
  readonly firedWith?: Readonly<Record<string, string>>;
};

/**
 * Something already at a destination before anything is filed there, written
 * the only way `/v1` can: a capture holding the text, routed there by hand.
 */
export type FixtureNote = {
  readonly destination: string;
  readonly capability: string;
  readonly arguments: Json;
  readonly text: string;
};

export type Fixture = {
  /** Where a capture's link points. Each capture's link is a path under it. */
  readonly links?: string;
  readonly destinations: readonly FixtureDestination[];
  readonly templates: readonly FixtureTemplate[];
  /** Written before the templates fire, so one can file into what they hold. */
  readonly notes?: readonly FixtureNote[];
};

/** A template as the fixture wrote it and as the pool now holds it. */
export type LaidOut = {
  readonly fixture: FixtureTemplate;
  readonly held: Template;
};

/** Read rather than cast: a fixture is a file somebody wrote by hand. */
export function readFixture(value: unknown): Fixture {
  const fixture = objectAt(value, "the fixture");
  const links = fixture["links"];
  if (links !== undefined && typeof links !== "string") {
    throw new Error("the fixture's links is not a URL");
  }

  const destinations = listAt(fixture, "destinations").map((each, index) => {
    const at = `destinations[${index}]`;
    const one = objectAt(each, at);
    return {
      name: stringAt(one, "name", at),
      kind: stringAt(one, "kind", at),
      settings: objectAt(one["settings"], `${at}.settings`),
    };
  });

  const named = new Set(destinations.map((each) => each.name));
  const templates = listAt(fixture, "templates").map(
    (each, index): FixtureTemplate => {
      const at = `templates[${index}]`;
      const one = objectAt(each, at);
      const destination = stringAt(one, "destination", at);
      if (!named.has(destination)) {
        throw new Error(`${at} names ${destination}, which no destination is`);
      }
      const folder = one["folder"];
      if (folder !== undefined && !FOLDERS.includes(folder as Folder)) {
        throw new Error(`${at}.folder is not one of ${FOLDERS.join(", ")}`);
      }

      const asked = one["asked"];
      const firedWith = one["firedWith"];
      return {
        name: stringAt(one, "name", at),
        destination,
        capability: stringAt(one, "capability", at),
        arguments: objectAt(one["arguments"], `${at}.arguments`),
        ...(folder === undefined ? {} : { folder: folder as Folder }),
        ...(asked === undefined
          ? {}
          : { asked: objectAt(asked, `${at}.asked`) }),
        triggerTag: stringAt(one, "triggerTag", at),
        ...(firedWith === undefined
          ? {}
          : { firedWith: stringsAt(firedWith, `${at}.firedWith`) }),
      };
    },
  );

  const notes =
    fixture["notes"] === undefined
      ? undefined
      : listAt(fixture, "notes").map((each, index): FixtureNote => {
          const at = `notes[${index}]`;
          const one = objectAt(each, at);
          const destination = stringAt(one, "destination", at);
          if (!named.has(destination)) {
            throw new Error(
              `${at} names ${destination}, which no destination is`,
            );
          }
          return {
            destination,
            capability: stringAt(one, "capability", at),
            arguments: objectAt(one["arguments"], `${at}.arguments`),
            text: stringAt(one, "text", at),
          };
        });

  return {
    ...(links === undefined ? {} : { links }),
    destinations,
    templates,
    ...(notes === undefined ? {} : { notes }),
  };
}

/**
 * Makes every destination and template the fixture names that the pool does
 * not already hold under that name, and answers the fixture's templates as the
 * pool holds them, in the fixture's order.
 */
export async function layOut(
  http: Http,
  fixture: Fixture,
): Promise<{
  readonly destinations: ReadonlyMap<string, string>;
  readonly templates: readonly LaidOut[];
}> {
  const held = await http.get<Destinations>("/v1/destinations");
  const destinations = new Map(
    held.values.map((each) => [each.name, each.id] as const),
  );

  for (const destination of fixture.destinations) {
    if (destinations.has(destination.name)) continue;
    const made = await http.post<{ id: string }>(
      "/v1/destinations",
      destination,
    );
    destinations.set(destination.name, made.id);
  }

  const known = await http.get<Templates>("/v1/templates");
  const templates = new Map<string, Template>(
    known.values.map((each) => [each.name, each] as const),
  );

  for (const template of fixture.templates) {
    if (templates.has(template.name)) continue;
    const { firedWith: _seeds, ...saved } = template;
    const made = await http.post<Template>("/v1/templates", {
      ...saved,
      destination: destinations.get(template.destination),
    });
    templates.set(template.name, made);
  }

  return {
    destinations,
    templates: fixture.templates.flatMap((each) => {
      const held = templates.get(each.name);
      return held === undefined ? [] : [{ fixture: each, held }];
    }),
  };
}

function objectAt(value: unknown, at: string): Json {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${at} is not an object`);
  }
  return value as Json;
}

function stringsAt(
  value: unknown,
  at: string,
): Readonly<Record<string, string>> {
  const held = objectAt(value, at);
  for (const [key, one] of Object.entries(held)) {
    if (typeof one !== "string") throw new Error(`${at}.${key} is not text`);
  }
  return held as Readonly<Record<string, string>>;
}

function listAt(value: Json, key: string): readonly unknown[] {
  const list = value[key];
  if (!Array.isArray(list))
    throw new Error(`the fixture's ${key} is not a list`);
  return list;
}

function stringAt(value: Json, key: string, at: string): string {
  const found = value[key];
  if (typeof found !== "string" || found === "") {
    throw new Error(`${at}.${key} is not a name`);
  }
  return found;
}
