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

/** Without the bytes, which are their own fetch and may be large. */
export const outputSchema = z
  .object({
    content: z
      .object({
        /** The same hash the output fetch answers as its `ETag`. */
        blob: z.string(),
        mediaType: z.string(),
      })
      .optional()
      .openapi({
        description:
          "Present where there are bytes to read at `/v1/routing/{record}/output`.",
        example: { blob: "e3b0c44298fc1c14...", mediaType: "text/markdown" },
      }),
    note: z.string().optional().openapi({
      description:
        "What the destination could not carry, in its own words. Free prose: nothing parses it.",
      example: "the two pictures were not carried",
    }),
  })
  .openapi("DeliveryOutput");

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
    /**
     * Where the decision came from a routing template, which the record names,
     * and whether the trigger tag made it — a decision a person made with the
     * item in front of them and one a tag made are the same delivery and not
     * the same act. Absent where a person made the decision by hand.
     */
    applied: z
      .object({ template: z.string(), firedByTag: z.boolean() })
      .optional()
      .openapi({
        description:
          "The routing template this decision came from, and whether its trigger tag applied it. Absent for a decision made by hand.",
      }),
    /** A pending record is a delivery that has not landed; anything else has. */
    state: z.enum(["pending", "delivered"]),
    at: z.string(),
    /** Best-effort: where the item once went, never where it is. */
    pointer: z.string().optional(),
    /** A link to the same place, where the destination could offer one. */
    url: z.string().optional(),
    output: outputSchema.optional(),
  })
  .openapi("RoutingRecord");

export const routingRecordsSchema = z
  .object({ values: z.array(routingRecordSchema) })
  .openapi("RoutingRecords");

/**
 * One route, two bodies, because it is one decision either way: a destination
 * with its capability and arguments, or a template that already holds all
 * three. A template's arguments are expanded when the decision is made, so the
 * record carries a place a person can read.
 */
export const routeRequestSchema = z
  .union([
    z.strictObject({
      destination: z.string().min(1).openapi({
        description: "One of the ids `GET /v1/destinations` reports.",
        example: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
      }),
      capability: z.string().min(1).openapi({
        description: "One the destination declared. Anything else is refused.",
        example: "create",
      }),
      arguments: jsonObject.openapi({
        description:
          "What the capability is pointed at, in its own terms. Must satisfy the capability's `argumentsSchema`.",
        example: { directory: "inbox", filename: "a-thought.md" },
      }),
    }),
    z.strictObject({
      template: z.string().min(1).openapi({
        description: "One of the ids `GET /v1/templates` reports.",
        example: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
      }),
    }),
  ])
  .openapi("RouteRequest");

export const capabilitySchema = z
  .object({
    name: z.string(),
    accepts: z.array(z.string()),
    /** JSON Schema: the whole of what a client needs to build the arguments. */
    argumentsSchema: jsonObject,
  })
  .openapi("Capability");

/** Indicative, never binding: the delivery converts again when it runs. */
export const previewSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("previewed"),
      content: z
        .object({
          mediaType: z.string(),
          /** Absent where the media type is not one this route can put in JSON. */
          text: z.string().optional(),
          /** True where the preview was longer than this daemon inlines. */
          truncated: z.boolean(),
        })
        .optional(),
      /** What the destination says it would not carry. Free prose. */
      note: z.string().optional(),
    }),
    z.object({ kind: z.literal("rejected"), detail: z.string() }),
    z.object({ kind: z.literal("unreachable"), detail: z.string() }),
    z.object({ kind: z.literal("not-offered") }),
  ])
  .openapi("RoutingPreview");
