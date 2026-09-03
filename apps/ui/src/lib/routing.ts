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
 * What a decision just made says about itself. A record the pool answered as
 * `pending` has been recorded and not delivered, and saying otherwise would be
 * the shell claiming something only the delivery can know.
 */
export function saidOf(
  record: RoutingRecord,
  nameOf: (destination: string) => string,
): Raised {
  if (record.target.kind !== "destination") {
    return { what: "done", key: `record:${record.id}` };
  }

  const name = nameOf(record.target.destination);

  return record.state === "delivered"
    ? {
        what: `routed · ${name}`,
        ...(record.pointer === undefined ? {} : { why: record.pointer }),
        key: `record:${record.id}`,
      }
    : { what: `deferred · ${name}`, why: "not delivered yet" };
}
