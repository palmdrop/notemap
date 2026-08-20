import type { RoutingRecord } from "@notemap/client";

/** Marking processed is routing whose destination is the person, so it reads as one. */
export function wentTo(
  record: RoutingRecord,
  nameOf: (destination: string) => string,
): string {
  return record.target.kind === "destination"
    ? `${nameOf(record.target.destination)} · ${record.target.capability}`
    : "marked done";
}
