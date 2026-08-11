import "@hono/zod-openapi";
import { z } from "zod";

import { jsonObject } from "./json";

/**
 * Wider than a tag's agent: work notemap drives on nobody's behalf is
 * attributable to notemap itself, and only the log records it.
 */
const agent = z.union([
  z.object({ kind: z.literal("notemap") }),
  z.object({ kind: z.literal("person") }),
  z.object({ kind: z.literal("provider"), provider: z.string() }),
  z.object({ kind: z.literal("source"), source: z.string() }),
]);

export const actionSchema = z
  .object({
    // Not an enum: a kind arrives with the mutation that appends it, and core's
    // `ActionKind` is the list. Spelling it again here is a second list to
    // disagree with the first.
    kind: z.string(),
    id: z.string(),
    subject: z.string().optional(),
    by: agent,
    at: z.string().openapi({
      description:
        "When the pool applied the action, which for a capture is its arrival.",
    }),
    detail: jsonObject.openapi({
      description: "Facts about what changed, shaped by the kind.",
    }),
  })
  .openapi("Action");

export const actionSliceSchema = z
  .object({
    values: z.array(actionSchema),
    next: z.string().optional().openapi({
      description:
        "A ready-to-fetch relative URL for the next page, carrying the filter. Absent on the last page.",
      example: "/v1/actions?order=newest-first&limit=50&after=...",
    }),
  })
  .openapi("ActionSlice");
