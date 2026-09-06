import type { Duration, Timestamp } from "#types/domain/ids";

export function later(at: Timestamp, by: Duration): Timestamp {
  return new Date(Date.parse(at) + by).toISOString() as Timestamp;
}
