import "@hono/zod-openapi";
import { z } from "zod";

import { jsonObject } from "./json";

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
        /** What the capability was pointed at, in its own terms. */
        target: jsonObject,
      }),
      z.object({ kind: z.literal("user"), note: z.string().optional() }),
    ]),
    /** A pending record is a delivery that has not landed; anything else has. */
    state: z.enum(["pending", "delivered"]),
    at: z.string(),
    /** Best-effort: where the item once went, never where it is. */
    pointer: z.string().optional(),
  })
  .openapi("RoutingRecord");

export const routingRecordsSchema = z
  .object({ values: z.array(routingRecordSchema) })
  .openapi("RoutingRecords");
