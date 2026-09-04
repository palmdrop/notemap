import type { RoutingRecord, RoutingSummary } from "@notemap/client";

import type { Raised } from "./notices.svelte";

/** Marking processed is routing whose destination is the person, so it reads as one. */
export function wentTo(
  record: RoutingRecord,
  nameOf: (destination: string) => string,
): string {
  return record.target.kind === "destination"
    ? `${nameOf(record.target.destination)} · ${record.target.capability}`
    : "marked done";
}

export function whereItWent(
  summary: RoutingSummary,
  nameOf: (destination: string) => string,
): string {
  const places = summary.to.map((went) =>
    went.kind === "destination" ? nameOf(went.destination) : "marked done",
  );

  return summary.pending === 0
    ? places.join(", ")
    : `${places.join(", ")} · ${summary.pending} pending`;
}

/**
 * Where a delivery put a copy, in the words a person could go and look with:
 * the pointer the destination handed back, or failing that the place the
 * decision named.
 */
function placeIn(record: RoutingRecord): string | undefined {
  if (record.pointer !== undefined) return record.pointer;
  if (record.target.kind !== "destination") return undefined;

  const said = Object.values(record.target.arguments)
    .filter((value): value is string => typeof value === "string")
    .filter((value) => value !== "");

  return said.length === 0 ? undefined : said.join(" · ");
}

/**
 * One decision, however many ways the shell comes to hear of it: from the
 * gesture that made it, and from the log a poll later.
 */
export function keyFor(record: string): string {
  return `record:${record}`;
}

/**
 * What a decision just made says about itself. A record the pool answered as
 * `pending` was attempted and did not go, so it reads as **retrying** — saying
 * it was routed would be the shell claiming the one thing only the delivery
 * can establish.
 */
export function saidOf(
  record: RoutingRecord,
  nameOf: (destination: string) => string,
  about?: string,
): Raised {
  const where = about === undefined ? {} : { about };

  if (record.target.kind !== "destination") {
    return { what: "marked done", ...where, key: keyFor(record.id) };
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
