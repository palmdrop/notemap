import { createRoute, z } from "@hono/zod-openapi";

import {
  captureEnvelopeSchema,
  captureOutcomeSchema,
  errorSchema,
  feedSliceSchema,
  itemSchema,
} from "./wire";

const JSON_CONTENT = "application/json";

function errorResponse(
  description: string,
  codes: readonly [string, ...string[]],
) {
  return {
    description,
    content: { [JSON_CONTENT]: { schema: errorSchema(codes) } },
  };
}

/**
 * The feed's parameters are declared as plain strings and checked by hand in
 * the handler. Letting the framework validate them would answer a bad `order`
 * or `limit` in its own error shape, and this API answers in exactly one:
 * `{ error: { code, ...facts } }`.
 */
const feedQuery = z.object({
  order: z
    .string()
    .optional()
    .openapi({
      param: { name: "order", in: "query" },
      description: "`newest-first` (default) or `oldest-first`.",
      example: "newest-first",
    }),
  limit: z
    .string()
    .optional()
    .openapi({
      param: { name: "limit", in: "query" },
      description:
        "1–500. Defaults to 50. A larger value is refused, not clamped.",
      example: "50",
    }),
  after: z
    .string()
    .optional()
    .openapi({
      param: { name: "after", in: "query" },
      description:
        "The position to continue from: `<at>,<id>`, or a bare RFC 3339 timestamp as a coarse entry point.",
      example: "2026-08-08T09:00:00.000Z,0198f0c2-0000-7000-8000-000000000000",
    }),
});

export const captureRoute = createRoute({
  method: "post",
  path: "/v1/captures",
  summary: "Capture something into the pool",
  description:
    "The body is a capture envelope. Submitting the same capture twice has no additional effect and answers 200 rather than 201.",
  request: {
    body: {
      required: true,
      content: { [JSON_CONTENT]: { schema: captureEnvelopeSchema } },
    },
  },
  responses: {
    201: {
      description: "Captured. `Location` names the item.",
      headers: z.object({
        Location: z.string().openapi({ example: "/v1/items/0198f0c2-..." }),
      }),
      content: { [JSON_CONTENT]: { schema: captureOutcomeSchema } },
    },
    200: {
      description:
        "Already captured. `matchedOn` says which identity the replay matched.",
      content: { [JSON_CONTENT]: { schema: captureOutcomeSchema } },
    },
    400: errorResponse("The body could not be read as an envelope.", [
      "malformed-json",
      "malformed-envelope",
    ]),
    409: errorResponse(
      "The identity exists and the content differs. Nothing was written.",
      ["capture-id-conflict", "source-item-changed"],
    ),
    415: errorResponse("The body was not JSON.", ["unsupported-media-type"]),
    422: errorResponse(
      "The envelope was understood and the pool declined it.",
      [
        "unknown-payload-type",
        "payload-invalid",
        "missing-asset-slot",
        "unknown-asset",
        "asset-hash-mismatch",
      ],
    ),
  },
});

export const feedRoute = createRoute({
  method: "get",
  path: "/v1/feed",
  summary: "Read the feed",
  description:
    "Every item chronologically by capture time, including archived and superseded ones. Follow `next` until it is absent.",
  request: { query: feedQuery },
  responses: {
    200: {
      description: "A page of the feed.",
      content: { [JSON_CONTENT]: { schema: feedSliceSchema } },
    },
    422: errorResponse("A parameter was understood and refused.", [
      "limit-too-large",
      "bad-limit",
      "bad-order",
      "bad-position",
    ]),
  },
});

export const itemRoute = createRoute({
  method: "get",
  path: "/v1/items/{id}",
  summary: "Read one item",
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "The item.",
      content: { [JSON_CONTENT]: { schema: itemSchema } },
    },
    404: errorResponse("No item has that id.", ["no-such-item"]),
  },
});
