import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { JSON_MEDIA_TYPE, MAX_LIMIT } from "../constants";
import {
  ASSET_STATUS,
  BODY_STATUS,
  CAPTURE_STATUS,
  codesFor,
  PARAMETER_STATUS,
  SUBJECT_STATUS,
  UPLOAD_STATUS,
} from "../errors/refusals";
import { actionSliceSchema } from "../schemas/action";
import { captureEnvelopeSchema } from "../schemas/envelope";
import { errorSchema } from "../schemas/error";
import {
  assetSchema,
  captureOutcomeSchema,
  feedSliceSchema,
  itemSchema,
} from "../schemas/item";
import type { StatusMap } from "../errors/refusals";

function errorResponse(
  description: string,
  status: number,
  ...maps: readonly StatusMap[]
) {
  return {
    description,
    content: {
      [JSON_MEDIA_TYPE]: { schema: errorSchema(codesFor(status, ...maps)) },
    },
  };
}

const pageQuery = z.object({
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
      description: `1–${MAX_LIMIT}. Defaults to 50. A larger value is refused, not clamped.`,
      example: "50",
    }),
  after: z
    .string()
    .optional()
    .openapi({
      param: { name: "after", in: "query" },
      description:
        "The position to continue from: `<at>,<id>`, or a bare instant as a coarse entry point.",
      example: "2026-08-08T09:00:00.000Z,0198f0c2-0000-7000-8000-000000000000",
    }),
});

const actionsQuery = pageQuery.extend({
  item: z
    .string()
    .optional()
    .openapi({
      param: { name: "item", in: "query" },
      description:
        "Narrows the read to one subject. Never validated: an id no item has answers an empty page, since the log outlives what it describes.",
      example: "0198f0c2-0000-7000-8000-000000000000",
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
      content: { [JSON_MEDIA_TYPE]: { schema: captureEnvelopeSchema } },
    },
  },
  responses: {
    201: {
      description: "Captured. `Location` names the item.",
      headers: z.object({
        Location: z.string().openapi({ example: "/v1/items/0198f0c2-..." }),
      }),
      content: { [JSON_MEDIA_TYPE]: { schema: captureOutcomeSchema } },
    },
    200: {
      description:
        "Already captured. `matchedOn` says which identity the replay matched.",
      content: { [JSON_MEDIA_TYPE]: { schema: captureOutcomeSchema } },
    },
    400: errorResponse(
      "The body could not be read as an envelope.",
      400,
      BODY_STATUS,
    ),
    409: errorResponse(
      "The identity exists and the content differs. Nothing was written.",
      409,
      CAPTURE_STATUS,
    ),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
    422: errorResponse(
      "The envelope was understood and the pool declined it.",
      422,
      CAPTURE_STATUS,
    ),
  },
});

export const feedRoute = createRoute({
  method: "get",
  path: "/v1/feed",
  summary: "Read the feed",
  description:
    "Every item chronologically by capture time, including archived and superseded ones. Follow `next` until it is absent.",
  request: { query: pageQuery },
  responses: {
    200: {
      description: "A page of the feed.",
      content: { [JSON_MEDIA_TYPE]: { schema: feedSliceSchema } },
    },
    422: errorResponse(
      "A parameter was understood and refused.",
      422,
      PARAMETER_STATUS,
    ),
  },
});

export const actionsRoute = createRoute({
  method: "get",
  path: "/v1/actions",
  summary: "Read the action log",
  description:
    "Every action that changed state, newest first by default. Narrow it to one subject with `item`; the log outlives the material, so a purged item's entries are still answered.",
  request: { query: actionsQuery },
  responses: {
    200: {
      description: "A page of the log.",
      content: { [JSON_MEDIA_TYPE]: { schema: actionSliceSchema } },
    },
    422: errorResponse(
      "A parameter was understood and refused.",
      422,
      PARAMETER_STATUS,
    ),
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
      content: { [JSON_MEDIA_TYPE]: { schema: itemSchema } },
    },
    404: errorResponse("No item has that id.", 404, SUBJECT_STATUS),
  },
});

const assetId = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});

export const assetUploadRoute = createRoute({
  method: "post",
  path: "/v1/assets",
  summary: "Upload bytes",
  description:
    "The body is the bytes, raw — not `multipart/form-data`. `Content-Type` is the asset's media type and is served back verbatim; `Content-Disposition` carries the filename, which is stored exactly as given. Anything may be uploaded; what may be rendered in place is decided on the way out.",
  request: {
    headers: z.object({
      "content-disposition": z.string().openapi({
        description:
          "`attachment; filename=\"photo.png\"`, or `filename*=UTF-8''…`.",
        example: 'attachment; filename="photo.png"',
      }),
      "repr-digest": z.string().optional().openapi({
        description:
          "RFC 9530. Recomputed over the bytes received and refused on mismatch. Only `sha-256` is understood; any other algorithm is ignored.",
        example: "sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:",
      }),
    }),
    body: {
      required: true,
      content: { "*/*": { schema: z.string().openapi({ format: "binary" }) } },
    },
  },
  responses: {
    201: {
      description: "Stored. `Location` names the asset.",
      headers: z.object({
        Location: z.string().openapi({ example: "/v1/assets/0198f0c2-..." }),
      }),
      content: { [JSON_MEDIA_TYPE]: { schema: assetSchema } },
    },
    413: errorResponse(
      "The body was larger than the configured limit. Nothing was stored.",
      413,
      UPLOAD_STATUS,
    ),
    415: errorResponse("The request carried no media type.", 415, BODY_STATUS),
    422: errorResponse(
      "The upload was understood and declined. Nothing was stored.",
      422,
      UPLOAD_STATUS,
    ),
  },
});

export const assetRoute = createRoute({
  method: "get",
  path: "/v1/assets/{id}",
  summary: "Read one asset",
  request: { params: assetId },
  responses: {
    200: {
      description: "The asset.",
      content: { [JSON_MEDIA_TYPE]: { schema: assetSchema } },
    },
    404: errorResponse("No asset has that id.", 404, ASSET_STATUS),
  },
});

export const assetContentRoute = createRoute({
  method: "get",
  path: "/v1/assets/{id}/content",
  summary: "Read an asset's bytes",
  description:
    "The recorded media type, served honestly, with `nosniff` and a sandbox CSP. `Content-Disposition` is `inline` for media that cannot execute and `attachment` for everything else. `ETag` is the blob hash, and the response is immutable: an asset id names one blob forever.",
  request: { params: assetId },
  responses: {
    200: {
      description: "The bytes.",
      headers: z.object({
        ETag: z.string().openapi({ example: '"e3b0c44298fc1c14..."' }),
        "Content-Disposition": z
          .string()
          .openapi({ example: 'inline; filename="photo.png"' }),
      }),
      content: { "*/*": { schema: z.string().openapi({ format: "binary" }) } },
    },
    404: errorResponse(
      "No asset has that id, or its blob is gone from disk.",
      404,
      ASSET_STATUS,
    ),
  },
});

export const ROUTES = [
  captureRoute,
  feedRoute,
  itemRoute,
  actionsRoute,
  assetUploadRoute,
  assetRoute,
  assetContentRoute,
] as const;

/** OpenAPI writes a path parameter `{id}`; Hono matches it as `:id`. */
export function honoPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}
