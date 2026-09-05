import "@hono/zod-openapi";
import { z } from "zod";

import type {
  AssetId,
  JsonObject,
  Payload,
  PayloadTypeName,
} from "@notemap/core";

import { jsonObject } from "./json";

const assetRef = z.object({
  slot: z.string(),
  asset: z.string(),
});

export const payloadSchema = z.object({
  type: z.string().min(1),
  content: jsonObject,
  metadata: jsonObject,
  assets: z.array(assetRef),
});

const tag = z.object({
  name: z.string(),
  by: z.union([
    z.object({ kind: z.literal("person") }),
    z.object({ kind: z.literal("provider"), provider: z.string() }),
    z.object({ kind: z.literal("source"), source: z.string() }),
  ]),
  addedAt: z.string(),
});

const routingSummary = z
  .object({
    records: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    to: z.array(
      z.union([
        z.object({ kind: z.literal("destination"), destination: z.string() }),
        z.object({ kind: z.literal("user") }),
      ]),
    ),
  })
  .openapi("RoutingSummary");

export const itemSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    sourceItemId: z.string(),
    payload: payloadSchema,
    tags: z.array(tag),
    createdAt: z.string(),
    utcOffset: z.number().int().optional(),
    contentUpdatedAt: z.string().optional(),
    revisionOf: z.string().optional(),
    archived: z
      .object({ archivedAt: z.string(), reason: z.string().optional() })
      .optional(),
    modifiedAt: z.string(),
    /** Empty rather than absent, so a reader asks for its length and nothing else. */
    revisedInto: z.array(z.string()),
    routing: routingSummary.optional(),
  })
  .openapi("Item");

export const assetSchema = z
  .object({
    id: z.string(),
    /** Exactly as uploaded: a filename is user data. */
    filename: z.string(),
    mime: z.string(),
    blob: z.string(),
    bytes: z.number().int().nonnegative(),
  })
  .openapi("Asset");

export const captureOutcomeSchema = z
  .union([
    z.object({ kind: z.literal("captured"), item: itemSchema }),
    z.object({
      kind: z.literal("already-captured"),
      item: itemSchema,
      matchedOn: z.enum(["id", "source"]),
    }),
  ])
  .openapi("CaptureOutcome");

/**
 * Strict, as the capture envelope is, and for the same reason: a dropped
 * `sourceItemId` costs a retried edit its match and appends a second revision.
 */
export const editEnvelopeSchema = z
  .strictObject({
    source: z.string().min(1),
    sourceItemId: z.string().min(1),
    payload: payloadSchema,
  })
  .openapi("EditEnvelope");

/** Field by field because every one of them is branded or narrowed. */
export function toPayload(parsed: z.infer<typeof payloadSchema>): Payload {
  return {
    type: parsed.type as PayloadTypeName,
    content: parsed.content as JsonObject,
    metadata: parsed.metadata as JsonObject,
    assets: parsed.assets.map((ref) => ({
      slot: ref.slot,
      asset: ref.asset as AssetId,
    })),
  };
}

export const editOutcomeSchema = z
  .union([
    z.object({ kind: z.literal("amended"), item: itemSchema }),
    z.object({
      kind: z.literal("revised"),
      revision: itemSchema,
      revisionOf: z.string(),
    }),
  ])
  .openapi("EditOutcome");

export const itemSliceSchema = z
  .object({
    values: z.array(itemSchema),
    next: z.string().optional().openapi({
      description:
        "A ready-to-fetch relative URL for the next page. Absent on the last page.",
      example: "/v1/feed?order=newest-first&limit=50&after=...",
    }),
  })
  .openapi("ItemSlice");
