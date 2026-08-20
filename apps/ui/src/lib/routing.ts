import type { RoutingRecord, RoutingSummary } from "@notemap/client";

/** Marking processed is routing whose destination is the person, so it reads as one. */
export function wentTo(
  record: RoutingRecord,
  nameOf: (destination: string) => string,
): string {
  return record.target.kind === "destination"
    ? `${nameOf(record.target.destination)} · ${record.target.capability}`
    : "marked done";
}

/** The places a row can name without asking for its records, and what has not landed. */
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
