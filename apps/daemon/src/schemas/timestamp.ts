import "@hono/zod-openapi";
import { z } from "zod";

import type { Timestamp } from "@notemap/core";

const ACCEPTED =
  "An ISO 8601 instant: a date-time carrying an offset (`2026-08-08T09:00:00Z`, `2026-08-08T09:00:00+02:00`), or a date alone, which means midnight UTC. A date-time without an offset is refused — there is no way to tell which zone it was written in.";

/**
 * Wider than RFC 3339 on the way in and exactly RFC 3339 on the way out. A
 * date-time with no offset is the one relaxation not offered: reading it as
 * either UTC or the daemon's own zone silently moves the capture.
 */
export const instant = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .openapi({ description: ACCEPTED, example: "2026-08-08T09:00:00.000Z" });

export function toTimestamp(value: string): Timestamp {
  return new Date(value).toISOString() as Timestamp;
}
