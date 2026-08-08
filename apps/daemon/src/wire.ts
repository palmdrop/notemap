import { z } from "@hono/zod-openapi";

import type {
  CaptureEnvelope,
  CaptureOutcome,
  Item,
  JsonObject,
} from "@notemap/core";

/**
 * A branded id is an ordinary string on the wire; the brand is core's way of
 * keeping two kinds of id apart in the type system and means nothing here. The
 * cast is at the type level only, so the runtime schema — and therefore the
 * OpenAPI document — still says "string".
 */
function branded<T extends string>(): z.ZodType<T> {
  return z.string().min(1) as unknown as z.ZodType<T>;
}

/** Free-form JSON, which is what a payload's content and metadata are. */
function jsonObject(): z.ZodType<JsonObject> {
  return z.record(z.string(), z.unknown()) as unknown as z.ZodType<JsonObject>;
}

const assetRef = z.object({
  slot: z.string(),
  asset: branded(),
  hash: branded(),
});

const payload = z.object({
  type: branded(),
  content: jsonObject(),
  metadata: jsonObject(),
  assets: z.array(assetRef),
});

const tag = z.object({
  name: branded(),
  by: z.union([
    z.object({ kind: z.literal("person") }),
    z.object({ kind: z.literal("provider"), provider: branded() }),
    z.object({ kind: z.literal("source"), source: branded() }),
  ]),
  addedAt: branded(),
});

/**
 * Strict: a key notemap does not know is a client's typo, and silently dropping
 * `capturedat` would file the capture at the wrong time forever. `/v1` may take
 * breaking changes until the first pool worth keeping exists (ADR 9), so the
 * additive-evolution argument for tolerance does not apply yet.
 */
export const captureEnvelopeSchema = z
  .strictObject({
    id: branded().optional(),
    source: branded(),
    sourceItemId: z.string().min(1),
    capturedAt: branded(),
    payload: payload,
    tags: z.array(branded()).optional(),
  })
  .openapi("CaptureEnvelope");

export const itemSchema = z
  .object({
    id: branded(),
    source: branded(),
    sourceItemId: z.string(),
    payload: payload,
    tags: z.array(tag),
    createdAt: branded(),
    contentUpdatedAt: branded().optional(),
    revisionOf: branded().optional(),
    archived: z
      .object({ archivedAt: branded(), reason: z.string().optional() })
      .optional(),
    modifiedAt: branded(),
    supersededBy: branded().optional(),
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

export function errorSchema(codes: readonly [string, ...string[]]) {
  return z.object({
    error: z.looseObject({ code: z.enum(codes) }).openapi({
      description: "The refusal's kind, with its facts beside it.",
    }),
  });
}

/**
 * Assigning the wire's inferred type to core's fails to compile when a core
 * type gains a field this schema forgot — the drift that would otherwise reach
 * the OpenAPI document unnoticed. The other direction, a field here that core
 * does not have, is caught by `toEnvelope` in `routes.ts`, whose return type is
 * core's.
 */
const _wireDescribesEnvelope: CaptureEnvelope = {} as z.infer<
  typeof captureEnvelopeSchema
>;
const _wireDescribesItem: Item = {} as z.infer<typeof itemSchema>;
const _wireDescribesOutcome: CaptureOutcome = {} as z.infer<
  typeof captureOutcomeSchema
>;
void _wireDescribesEnvelope;
void _wireDescribesItem;
void _wireDescribesOutcome;
