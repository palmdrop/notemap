import type {
  Capability,
  RoutingRecord,
  RoutingSummary,
} from "@notemap/client";

import { OWN_ARGUMENTS } from "./arguments";
import { fieldsOf } from "./schema-form";
import type { Raised } from "./notices.svelte";

/**
 * The last segment of a place, prefixed `…/` where more remains before it: a
 * row's line stays one line long whatever the path's depth, and the elided
 * head is still in the element's own `title`.
 */
export function placeShort(place: string): string {
  const at = place.lastIndexOf("/");
  return at < 0 ? place : `…/${place.slice(at + 1)}`;
}

/**
 * How a capability's arguments read, from its schema. An inheriting field is a
 * destination setting taken for one delivery — how a note is written rather
 * than where it went — so it is never part of the place. A capability with a
 * path field hands back a pointer that is a path too; any other pointer is a
 * handle the destination minted, and the place its decision named says more.
 */
export type Reading = {
  readonly settings: readonly string[];
  readonly pathed: boolean;
};

export function readingOf(
  capability: Capability | undefined,
): Reading | undefined {
  if (capability === undefined) return undefined;
  const fields = fieldsOf(capability.argumentsSchema);
  return {
    settings: fields
      .filter((field) => field.inherits)
      .map((field) => field.name),
    pathed: fields.some((field) => field.path),
  };
}

/**
 * What one record says on a row: where it went, and the place it landed, cut
 * to its last segment so the line never wraps a long path. The capability is
 * the adapter's vocabulary rather than a person's, and a record that is not
 * pending was delivered — so the words those two spent are the words the place
 * needed. Marking processed is routing whose destination is the person, so it
 * reads as one.
 */
export type Went = {
  readonly name: string;
  readonly place?: string;
  /** The whole place, where `place` is cut. */
  readonly title?: string;
  readonly pending?: true;
  /** What the person wrote about a decision made by hand. */
  readonly note?: string;
};

export function wentTo(
  record: RoutingRecord,
  nameOf: (destination: string) => string,
  called?: Namer,
  reading?: Reading,
): Went {
  if (record.target.kind !== "destination") {
    const note = record.target.note;
    return { name: "manual", ...(note === undefined ? {} : { note }) };
  }

  const place = placeIn(record, called, reading);

  return {
    name: nameOf(record.target.destination),
    ...(place === undefined ? {} : { place: placeShort(place), title: place }),
    ...(record.state === "pending" ? { pending: true } : {}),
  };
}

/** The names of where a summary says an item went, in order. */
export function wentWhere(
  summary: RoutingSummary,
  nameOf: (destination: string) => string,
): readonly string[] {
  return summary.to.map((went) =>
    went.kind === "destination" ? nameOf(went.destination) : "manual",
  );
}

/**
 * What an argument set says about where, without knowing the capability: every
 * string it holds, in the order the destination declared them. A board column,
 * a mailbox or a capability nobody has written yet reads as well as a path
 * does, which is what keeps this from being a table of field names.
 *
 * Notemap's own arguments are left out, and so are the `settings` a schema
 * marks as inheriting: a folder mode or a frontmatter mode is about how a note
 * gets somewhere rather than the somewhere, and `research/2026.md, none` reads
 * as though the note went to two places.
 */
export function placeNamed(
  args: Readonly<Record<string, unknown>>,
  called?: Namer,
  settings: readonly string[] = [],
): string | undefined {
  const said = Object.entries(args)
    .filter(([name]) => !OWN_ARGUMENTS.includes(name))
    .filter(([name]) => !settings.includes(name))
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1] !== "",
    )
    .map(([name, value]) => called?.(name, value) ?? value);

  return said.length === 0 ? undefined : said.join(", ");
}

/**
 * What a value is called, where anything knows. A field whose value is a handle
 * nobody wrote — an are.na channel id — reads as the name it stands for, and
 * everything else reads as itself. Passed in rather than looked up here: this
 * module is what a row says about a record, and knowing where names come from
 * is somebody else's business.
 */
export type Namer = (field: string, value: string) => string | undefined;

/**
 * Where a delivery put a copy, in the words a person could go and look with:
 * the pointer the destination handed back where it is a path, or else the
 * place the decision named. Until the capability has been read, the pointer
 * wins, as it did before anything could tell a path from a handle.
 */
export function placeIn(
  record: RoutingRecord,
  called?: Namer,
  reading?: Reading,
): string | undefined {
  if (record.target.kind !== "destination") return undefined;

  const named = placeNamed(record.target.arguments, called, reading?.settings);
  if (reading === undefined || reading.pathed) return record.pointer ?? named;
  return named ?? record.pointer;
}

/**
 * One decision, however many ways the shell comes to hear of it: from the
 * gesture that made it, and from the log a poll later.
 */
export function keyFor(record: string): string {
  return `record:${record}`;
}

/** A decision taken back, said once whichever of the shell or the log says it first. */
export function cancelledKey(record: string): string {
  return `cancelled:${record}`;
}

/** An item discarded, which an `undo` would put back. */
export function discardedKey(item: string): string {
  return `discarded:${item}`;
}

/**
 * What a decision just made says about itself. A record the pool answered as
 * `pending` was attempted and did not go, so it reads as **retrying** — saying
 * it was routed would be the shell claiming the one thing only the delivery
 * can establish. It carries the way to the capture it was about: the row it
 * was made on may be gone by the time somebody reads this.
 */
export function saidOf(
  record: RoutingRecord,
  nameOf: (destination: string) => string,
  which: {
    readonly about?: string;
    readonly href?: string;
    readonly reading?: Reading;
  } = {},
): Raised {
  const where = {
    ...(which.about === undefined ? {} : { about: which.about }),
    ...(which.href === undefined ? {} : { href: which.href }),
  };

  if (record.target.kind !== "destination") {
    return { what: "marked processed", ...where, key: keyFor(record.id) };
  }

  const name = nameOf(record.target.destination);
  const place = placeIn(record, undefined, which.reading);

  return record.state === "delivered"
    ? {
        what: "routed",
        subject: name,
        ...(place === undefined ? {} : { why: place }),
        ...where,
        key: keyFor(record.id),
      }
    : {
        what: "retrying",
        subject: name,
        why:
          place === undefined
            ? "not delivered yet"
            : `not delivered yet to ${place}`,
        ...where,
      };
}
