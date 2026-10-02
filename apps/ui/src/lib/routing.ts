import type {
  Capability,
  RoutingRecord,
  RoutingSummary,
} from "@notemap/client";

import { OWN_ARGUMENTS } from "./arguments";
import { fieldsOf, type Field, type PathRole } from "./schema-form";
import type { Raised } from "./notices.svelte";

/**
 * The last segment of a place, prefixed `…/` where more remains before it: a
 * row's line stays one line long whatever the path's depth, and the elided
 * head is still in the element's own `title`. A place ending in `/` names a
 * folder, and keeps the folder rather than the nothing after it.
 */
export function placeShort(place: string): string {
  const folder = place.endsWith("/");
  const held = folder ? place.slice(0, -1) : place;
  const at = held.lastIndexOf("/");
  if (at < 0) return place;
  return `…/${held.slice(at + 1)}${folder ? "/" : ""}`;
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
  /** Where the path is split across a folders field and the leaf completing it. */
  readonly split?: Split;
};

export type Split = { readonly folders: string; readonly leaf?: string };

export function readingOf(
  capability: Capability | undefined,
): Reading | undefined {
  if (capability === undefined) return undefined;
  const fields = fieldsOf(capability.argumentsSchema);
  const split = splitOf(fields);
  return {
    settings: fields
      .filter((field) => field.inherits)
      .map((field) => field.name),
    pathed: fields.some((field) => field.path !== undefined),
    ...(split === undefined ? {} : { split }),
  };
}

/** Two folders fields, or two leaves, say nothing a place could be composed from. */
function splitOf(fields: readonly Field[]): Split | undefined {
  const named = (role: PathRole) =>
    fields.filter((field) => field.path === role).map((field) => field.name);
  const [folders, ...moreFolders] = named("folders");
  const [leaf, ...moreLeaves] = named("leaf");
  if (folders === undefined || moreFolders.length + moreLeaves.length > 0) {
    return undefined;
  }
  return leaf === undefined ? { folders } : { folders, leaf };
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
  reading?: Reading | "asking",
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
 * as though the note went to two places. A path split across folders and a
 * leaf reads as the one path it is.
 */
export function placeNamed(
  args: Readonly<Record<string, unknown>>,
  called?: Namer,
  reading?: Reading,
): string | undefined {
  const settings = reading?.settings ?? [];
  const split = reading?.split;
  const path = split === undefined ? undefined : joined(args, split, called);
  const inPath = (name: string) =>
    split !== undefined && (name === split.folders || name === split.leaf);

  let placed = false;
  const said = Object.entries(args)
    .filter(([name]) => !OWN_ARGUMENTS.includes(name))
    .filter(([name]) => !settings.includes(name))
    .flatMap(([name, value]): string[] => {
      if (inPath(name)) {
        if (placed || path === undefined) return [];
        placed = true;
        return [path];
      }
      return typeof value === "string" && value !== ""
        ? [called?.(name, value) ?? value]
        : [];
    });

  return said.length === 0 ? undefined : said.join(", ");
}

/** A folders field with no leaf names the folder, and ends in `/` to say so. */
function joined(
  args: Readonly<Record<string, unknown>>,
  split: Split,
  called?: Namer,
): string | undefined {
  const part = (field: string | undefined) => {
    const value = field === undefined ? undefined : args[field];
    return field === undefined || typeof value !== "string" || value === ""
      ? undefined
      : (called?.(field, value) ?? value);
  };

  const folders = part(split.folders)?.replace(/\/+$/, "");
  const leaf = part(split.leaf);
  if (folders === undefined || folders === "") return leaf;
  return `${folders}/${leaf ?? ""}`;
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
 * place the decision named. Nothing while the capability is still `asking`,
 * so a line does not say a handle or a setting and then take it back. Where it
 * could not be read at all, the pointer wins, as it did before anything could
 * tell a path from a handle.
 */
export function placeIn(
  record: RoutingRecord,
  called?: Namer,
  reading?: Reading | "asking",
): string | undefined {
  if (record.target.kind !== "destination" || reading === "asking") {
    return undefined;
  }

  const named = placeNamed(record.target.arguments, called, reading);
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
