import "@hono/zod-openapi";
import { z } from "zod";

export const markProcessedRequestSchema = z
  .strictObject({
    note: z.string().min(1).optional().openapi({
      description: "Where the user carried the content, in their own words.",
      example: "pasted into the fiction-a vault",
    }),
  })
  .openapi("MarkProcessedRequest");

export const routingRecordSchema = z
  .object({
    id: z.string(),
    item: z.string(),
    target: z.union([
      z.object({
        kind: z.literal("destination"),
        destination: z.string(),
        capability: z.string(),
      }),
      z.object({ kind: z.literal("user"), note: z.string().optional() }),
    ]),
    at: z.string(),
    /** Best-effort: where the item once went, never where it is. */
    pointer: z.string().optional(),
  })
  .openapi("RoutingRecord");

export const routingRecordsSchema = z
  .object({ values: z.array(routingRecordSchema) })
  .openapi("RoutingRecords");
