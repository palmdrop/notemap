import "@hono/zod-openapi";
import { z } from "zod";

import type {
  AssetId,
  CaptureEnvelope,
  ItemId,
  JsonObject,
  PayloadTypeName,
  SourceId,
  TagName,
} from "@notemap/core";

import { payloadSchema } from "./item";
import { instant, toTimestamp } from "./timestamp";

/**
 * Strict: an unrecognised key is a client's typo, and a silently dropped
 * `capturedat` files the capture at the wrong time forever.
 */
export const captureEnvelopeSchema = z
  .strictObject({
    id: z.string().min(1).optional(),
    source: z.string().min(1),
    sourceItemId: z.string().min(1),
    capturedAt: instant,
    payload: payloadSchema,
    tags: z.array(z.string().min(1)).optional(),
  })
  .openapi("CaptureEnvelope");

/**
 * Where an untrusted body becomes a domain value. Written out field by field so
 * a field core adds fails to compile rather than silently never arriving.
 */
export function toEnvelope(
  parsed: z.infer<typeof captureEnvelopeSchema>,
): CaptureEnvelope {
  return {
    ...(parsed.id === undefined ? {} : { id: parsed.id as ItemId }),
    source: parsed.source as SourceId,
    sourceItemId: parsed.sourceItemId,
    capturedAt: toTimestamp(parsed.capturedAt),
    payload: {
      type: parsed.payload.type as PayloadTypeName,
      content: parsed.payload.content as JsonObject,
      metadata: parsed.payload.metadata as JsonObject,
      assets: parsed.payload.assets.map((ref) => ({
        slot: ref.slot,
        asset: ref.asset as AssetId,
      })),
    },
    ...(parsed.tags === undefined ? {} : { tags: parsed.tags as TagName[] }),
  };
}
