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
        arguments: jsonObject,
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

export const routeRequestSchema = z
  .strictObject({
    destination: z.string().min(1).openapi({
      description: "One of the ids `GET /v1/destinations` reports.",
      example: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
    }),
    capability: z.string().min(1).openapi({
      description: "One the destination declared. Anything else is refused.",
      example: "create-file",
    }),
    arguments: jsonObject.openapi({
      description:
        "What the capability is pointed at, in its own terms. Must satisfy the capability's `argumentsSchema`.",
      example: { directory: "inbox", filename: "a-thought.md" },
    }),
  })
  .openapi("RouteRequest");

export const capabilitySchema = z
  .object({
    name: z.string(),
    accepts: z.array(z.string()),
    /** JSON Schema: the whole of what a client needs to build the arguments. */
    argumentsSchema: jsonObject,
  })
  .openapi("Capability");
