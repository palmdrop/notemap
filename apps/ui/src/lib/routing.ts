import type { RoutingRecord, RoutingSummary } from "@notemap/client";

import { OWN_ARGUMENTS } from "./arguments";
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
 * What one record says on a row: where it went, and the place it landed, cut
 * to its last segment so the line never wraps a long path. The capability is
 * the adapter's vocabulary rather than a person's, and a record that is not
 * saying otherwise was delivered — so the words those two spent are the words
 * the place needed. Marking processed is routing whose destination is the
 * person, so it reads as one.
 */
export function wentTo(
  record: RoutingRecord,
  nameOf: (destination: string) => string,
  called?: Namer,
): { readonly said: string; readonly aside?: string; readonly title?: string } {
  if (record.target.kind !== "destination") {
    const note = record.target.note;
    return { said: "manual", ...(note === undefined ? {} : { aside: note }) };
  }

  const name = nameOf(record.target.destination);
  const place = placeIn(record, called);

  return {
    said: place === undefined ? name : `${name} · ${placeShort(place)}`,
    ...(place === undefined ? {} : { title: place }),
    ...(record.state === "delivered" ? {} : { aside: record.state }),
  };
}

export function whereItWent(
  summary: RoutingSummary,
  nameOf: (destination: string) => string,
): string {
  const places = summary.to.map((went) =>
    went.kind === "destination" ? nameOf(went.destination) : "manual",
  );

  return summary.pending === 0
    ? places.join(", ")
    : `${places.join(", ")} · ${summary.pending} pending`;
}

/**
 * What an argument set says about where, without knowing the capability: every
 * string it holds, in the order the destination declared them. A board column,
 * a mailbox or a capability nobody has written yet reads as well as a path
 * does, which is what keeps this from being a table of field names.
 *
 * Notemap's own arguments are left out. A folder mode is a condition about
 * getting somewhere rather than the somewhere, and `research/2026.md · require`
 * reads as though the note went to two places.
 */
export function placeNamed(
  args: Readonly<Record<string, unknown>>,
  called?: Namer,
): string | undefined {
  const said = Object.entries(args)
    .filter(([name]) => !OWN_ARGUMENTS.includes(name))
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1] !== "",
    )
    .map(([name, value]) => called?.(name, value) ?? value);

  return said.length === 0 ? undefined : said.join(" · ");
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
 * the pointer the destination handed back, or failing that the place the
 * decision named.
 */
function placeIn(record: RoutingRecord, called?: Namer): string | undefined {
  if (record.pointer !== undefined) return record.pointer;
  if (record.target.kind !== "destination") return undefined;

  return placeNamed(record.target.arguments, called);
}

/**
 * One decision, however many ways the shell comes to hear of it: from the
 * gesture that made it, and from the log a poll later.
 */
export function keyFor(record: string): string {
  return `record:${record}`;
}

/**
 * One firing, said once. The shell raises this the moment it tags, because the
 * window a fired template waits out is shorter than the log is polled and a
 * cancel nobody can see yet is no cancel at all; the log's own entry then
 * arrives under the same name and adds nothing.
 */
export function firedKey(record: string): string {
  return `fired:${record}`;
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
  which: { readonly about?: string; readonly href?: string } = {},
): Raised {
  const where = {
    ...(which.about === undefined ? {} : { about: which.about }),
    ...(which.href === undefined ? {} : { href: which.href }),
  };

  if (record.target.kind !== "destination") {
    return { what: "marked processed", ...where, key: keyFor(record.id) };
  }

  const name = nameOf(record.target.destination);
  const place = placeIn(record);

  return record.state === "delivered"
    ? {
        what: `routed · ${name}`,
        ...(place === undefined ? {} : { why: place }),
        ...where,
        key: keyFor(record.id),
      }
    : {
        what: `retrying · ${name}`,
        why:
          place === undefined
            ? "not delivered yet"
            : `not delivered yet · ${place}`,
        ...where,
      };
}
