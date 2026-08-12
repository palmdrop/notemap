import "@hono/zod-openapi";
import { z } from "zod";

import { jsonObject } from "./json";

const assetRef = z.object({
  slot: z.string(),
  asset: z.string(),
  hash: z.string(),
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

export const itemSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    sourceItemId: z.string(),
    payload: payloadSchema,
    tags: z.array(tag),
    createdAt: z.string(),
    contentUpdatedAt: z.string().optional(),
    revisionOf: z.string().optional(),
    archived: z
      .object({ archivedAt: z.string(), reason: z.string().optional() })
      .optional(),
    modifiedAt: z.string(),
    supersededBy: z.string().optional(),
  })
  .openapi("Item");

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

export const feedSliceSchema = z
  .object({
    values: z.array(itemSchema),
    next: z.string().optional().openapi({
      description:
        "A ready-to-fetch relative URL for the next page. Absent on the last page.",
      example: "/v1/feed?order=newest-first&limit=50&after=...",
    }),
  })
  .openapi("FeedSlice");
