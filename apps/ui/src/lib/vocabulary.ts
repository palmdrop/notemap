import { OWN_ARGUMENTS } from "./arguments";
import type { Field } from "./schema-form";

/**
 * The one vocabulary a route is read in, on the route page, a template and a
 * record: an action (new note, append) and a shape (raw, list, task). The
 * wire's names stay what rules are written against; these are what is drawn.
 * A name this shell has never heard of is said as itself.
 */

/**
 * One fact, a label and what it holds. `open` is the way to change it: a
 * route's step, or a template's place unpinned for one route.
 */
export type Fact = {
  readonly label: string;
  readonly value: string;
  readonly line?: string;
  readonly danger?: boolean;
  readonly open?: () => void;
  readonly opens?: string;
};

const ACTIONS: Readonly<Record<string, string>> = {
  create: "new note",
  append: "append",
  "create-or-append": "new note or append",
  "place-assets": "attachments only",
};

/** What a capability does, settled by the line's forecast where the line decides it. */
export function actionOf(
  capability: string,
  forecast?: "create" | "append",
): string {
  if (capability === "create-or-append" && forecast !== undefined) {
    return ACTIONS[forecast] ?? forecast;
  }
  return ACTIONS[capability] ?? capability;
}

/** The argument a destination names its conversion through. */
export const SHAPE_FIELD = "conversion";

const SHAPES: Readonly<Record<string, string>> = {
  block: "raw",
  "list-item": "list",
  task: "task",
};

const FOLDER_MODES: Readonly<Record<string, { word: string; line: string }>> = {
  create: { word: "Make it", line: "Made when it isn't there." },
  require: {
    word: "Must exist",
    line: "The delivery is rejected when it isn't there.",
  },
};

/** A field's label as this shell draws it. */
export function labelFor(field: Pick<Field, "name" | "title">): string {
  if (field.name === SHAPE_FIELD) return "shape";
  if (OWN_ARGUMENTS.includes(field.name)) return "if missing";
  return field.title ?? field.name;
}

/** A value as this shell draws it, for the fields whose words it owns. */
export function wordFor(field: string, value: string): string {
  if (field === SHAPE_FIELD) return SHAPES[value] ?? value;
  if (OWN_ARGUMENTS.includes(field)) return FOLDER_MODES[value]?.word ?? value;
  return value;
}

/** What a folder mode does, said under its word. */
export function lineFor(field: string, value: string): string | undefined {
  return OWN_ARGUMENTS.includes(field) ? FOLDER_MODES[value]?.line : undefined;
}

/**
 * The facts of a decision: the destination, the template it came from, the
 * action, then every argument that holds something, in the schema's order.
 */
export function factsOf(decision: {
  readonly destination: string;
  readonly template?: string;
  readonly capability?: string;
  readonly forecast?: "create" | "append";
  readonly fields: readonly Pick<Field, "name" | "title">[];
  readonly values: Readonly<Record<string, unknown>>;
}): Fact[] {
  const named = new Set(decision.fields.map((one) => one.name));
  const extra = Object.keys(decision.values)
    .filter((name) => !named.has(name))
    .map((name) => ({ name }));
  const said = [...decision.fields, ...extra].flatMap((field) => {
    const held = decision.values[field.name];
    if (held === undefined || held === null || held === "") return [];
    const value = typeof held === "string" ? held : JSON.stringify(held);
    return [{ label: labelFor(field), value: wordFor(field.name, value) }];
  });
  return [
    { label: "destination", value: decision.destination },
    ...(decision.template === undefined
      ? []
      : [{ label: "template", value: decision.template }]),
    ...(decision.capability === undefined
      ? []
      : [
          {
            label: "action",
            value: actionOf(decision.capability, decision.forecast),
          },
        ]),
    ...said,
  ];
}
