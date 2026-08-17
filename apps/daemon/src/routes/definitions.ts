import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { JSON_MEDIA_TYPE, MAX_LIMIT } from "../constants";
import {
  ARCHIVE_STATUS,
  ASSET_STATUS,
  BODY_STATUS,
  CANCEL_STATUS,
  CAPTURE_STATUS,
  codesFor,
  DELIVERY_STATUS,
  EDIT_STATUS,
  PARAMETER_STATUS,
  ROUTING_STATUS,
  SUBJECT_STATUS,
  TAG_STATUS,
  UPLOAD_STATUS,
} from "../errors/refusals";
import { actionSliceSchema } from "../schemas/action";
import {
  archiveRequestSchema,
  unarchiveRequestSchema,
} from "../schemas/archive";
import { captureEnvelopeSchema } from "../schemas/envelope";
import { errorSchema } from "../schemas/error";
import {
  assetSchema,
  captureOutcomeSchema,
  editOutcomeSchema,
  editRequestSchema,
  itemSchema,
  itemSliceSchema,
} from "../schemas/item";
import {
  destinationsSchema,
  markProcessedRequestSchema,
  routeRequestSchema,
  routingRecordSchema,
  routingRecordsSchema,
} from "../schemas/routing";
import { tagRequestSchema } from "../schemas/tags";
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

const itemViewQuery = pageQuery.extend({
  order: z
    .string()
    .optional()
    .openapi({
      param: { name: "order", in: "query" },
      description: "`oldest-first` (default) or `newest-first`.",
      example: "oldest-first",
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
      content: { [JSON_MEDIA_TYPE]: { schema: itemSliceSchema } },
    },
    422: errorResponse(
      "A parameter was understood and refused.",
      422,
      PARAMETER_STATUS,
    ),
  },
});

export const queueRoute = createRoute({
  method: "get",
  path: "/v1/queue",
  summary: "Read the queue",
  description:
    "Every item that is unprocessed, unarchived and not superseded, oldest first by default. Paginated by a **content-time** position, which is spelled like the feed's and means something else: the two are not interchangeable.",
  request: { query: itemViewQuery },
  responses: {
    200: {
      description: "A page of the queue.",
      content: { [JSON_MEDIA_TYPE]: { schema: itemSliceSchema } },
    },
    422: errorResponse(
      "A parameter was understood and refused.",
      422,
      PARAMETER_STATUS,
    ),
  },
});

export const archivedRoute = createRoute({
  method: "get",
  path: "/v1/archived",
  summary: "Read the archive",
  description:
    "Every archived item, on the queue's key and default. Archiving hides an item from the queue; it stays in the feed and stays processable.",
  request: { query: itemViewQuery },
  responses: {
    200: {
      description: "A page of the archive.",
      content: { [JSON_MEDIA_TYPE]: { schema: itemSliceSchema } },
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

const itemId = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});

export const archiveRoute = createRoute({
  method: "post",
  path: "/v1/items/{id}/archive",
  summary: "Archive an item",
  description:
    "Hides the item from the queue. It stays in the feed and stays processable. Archiving one that is already archived is refused rather than absorbed: a second archive would overwrite the reason and time the first recorded.",
  request: {
    params: itemId,
    body: {
      required: false,
      content: { [JSON_MEDIA_TYPE]: { schema: archiveRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "The item, now archived.",
      content: { [JSON_MEDIA_TYPE]: { schema: itemSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    404: errorResponse("No item has that id.", 404, ARCHIVE_STATUS),
    409: errorResponse("The item is already archived.", 409, ARCHIVE_STATUS),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
  },
});

export const unarchiveRoute = createRoute({
  method: "post",
  path: "/v1/items/{id}/unarchive",
  summary: "Unarchive an item",
  description:
    "Returns the item to the queue at its unchanged position, since archiving never moved it. Unarchiving one that is not archived is refused.",
  request: {
    params: itemId,
    body: {
      required: false,
      content: { [JSON_MEDIA_TYPE]: { schema: unarchiveRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "The item, no longer archived.",
      content: { [JSON_MEDIA_TYPE]: { schema: itemSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    404: errorResponse("No item has that id.", 404, ARCHIVE_STATUS),
    409: errorResponse("The item is not archived.", 409, ARCHIVE_STATUS),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
  },
});

export const tagRoute = createRoute({
  method: "post",
  path: "/v1/items/{id}/tag",
  summary: "Tag an item",
  description:
    "Adds one tag. Classification does not move an item, so a tagged item keeps its place in the queue. A tag the item already carries is absorbed rather than refused, keeping the attribution and time it has: a tag's name is the whole of the request, unlike an archive's reason.",
  request: {
    params: itemId,
    body: {
      required: true,
      content: { [JSON_MEDIA_TYPE]: { schema: tagRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "The item, as it now stands.",
      content: { [JSON_MEDIA_TYPE]: { schema: itemSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    404: errorResponse("No item has that id.", 404, TAG_STATUS),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
  },
});

export const untagRoute = createRoute({
  method: "post",
  path: "/v1/items/{id}/untag",
  summary: "Remove a tag from an item",
  description:
    "Removes one tag. A tag the item does not carry is absorbed rather than refused, on the same terms as adding one it already has.",
  request: {
    params: itemId,
    body: {
      required: true,
      content: { [JSON_MEDIA_TYPE]: { schema: tagRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "The item, as it now stands.",
      content: { [JSON_MEDIA_TYPE]: { schema: itemSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    404: errorResponse("No item has that id.", 404, TAG_STATUS),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
  },
});

export const editRoute = createRoute({
  method: "post",
  path: "/v1/items/{id}/edit",
  summary: "Edit an item's content",
  description:
    "Changes what the capture says. The pool decides the shape: an in-place **amendment** while the item is the newest in the feed and unprocessed, an appended **revision** otherwise. The client does not say which it wants and cannot know, so the outcome is read off the answer.",
  request: {
    params: itemId,
    body: {
      required: true,
      content: { [JSON_MEDIA_TYPE]: { schema: editRequestSchema } },
    },
  },
  responses: {
    200: {
      description:
        "What the edit became: the amended item, or the revision and the item it supersedes.",
      content: { [JSON_MEDIA_TYPE]: { schema: editOutcomeSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    404: errorResponse("No item has that id.", 404, EDIT_STATUS),
    409: errorResponse(
      "A revision already supersedes the item; edit that instead.",
      409,
      EDIT_STATUS,
    ),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
    422: errorResponse("The payload was declined.", 422, EDIT_STATUS),
  },
});

export const markProcessedRoute = createRoute({
  method: "post",
  path: "/v1/items/{id}/mark-processed",
  summary: "Mark an item processed by hand",
  description:
    "The user carried the content onward themselves. This is routing whose destination is the user: it appends a routing record, takes the item out of the queue, and leaves it in the feed unarchived. Doing it twice appends two records and is not refused.",
  request: {
    params: itemId,
    body: {
      required: false,
      content: { [JSON_MEDIA_TYPE]: { schema: markProcessedRequestSchema } },
    },
  },
  responses: {
    200: {
      description:
        "The routing record that was appended. A record has no URL of its own, so there is nothing for a 201 to name.",
      content: { [JSON_MEDIA_TYPE]: { schema: routingRecordSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    404: errorResponse("No item has that id.", 404, ROUTING_STATUS),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
  },
});

export const routingRecordsRoute = createRoute({
  method: "get",
  path: "/v1/items/{id}/routing",
  summary: "Read where an item has been",
  description:
    "An item's routing records, oldest first. Not paginated: they are item state rather than a surface over the pool, and go when the item does.",
  request: { params: itemId },
  responses: {
    200: {
      description: "The item's routing records.",
      content: { [JSON_MEDIA_TYPE]: { schema: routingRecordsSchema } },
    },
    404: errorResponse("No item has that id.", 404, SUBJECT_STATUS),
  },
});

export const destinationsRoute = createRoute({
  method: "get",
  path: "/v1/destinations",
  summary: "Read the configured destinations",
  description:
    "What each wired destination declares it can do. Core holds no list of capabilities of its own, so this is the adapters' own answer. `targetSchema` is JSON Schema and is the whole of what a client needs to build a `target`.",
  responses: {
    200: {
      description: "Every destination, with its capabilities.",
      content: { [JSON_MEDIA_TYPE]: { schema: destinationsSchema } },
    },
  },
});

export const routeItemRoute = createRoute({
  method: "post",
  path: "/v1/items/{id}/route",
  summary: "Route an item to a destination",
  description:
    "Records the decision and attempts the delivery once, inline. **The record answered may name a delivery that has not happened**: `state` is `pending` when the destination could not be reached, and a job carries it out later. A destination that was reached and refused writes nothing.",
  request: {
    params: itemId,
    body: {
      required: true,
      content: { [JSON_MEDIA_TYPE]: { schema: routeRequestSchema } },
    },
  },
  responses: {
    200: {
      description:
        "The routing record. Read `state` rather than reading a record as arrival.",
      content: { [JSON_MEDIA_TYPE]: { schema: routingRecordSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    404: errorResponse("No item has that id.", 404, ROUTING_STATUS),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
    422: errorResponse(
      "The destination, the capability, the payload type or the target was declined. Nothing was written.",
      422,
      DELIVERY_STATUS,
    ),
  },
});

export const cancelDeliveryRoute = createRoute({
  method: "post",
  path: "/v1/routing/{record}/cancel",
  summary: "Cancel a pending delivery",
  description:
    "Removes a reservation whose delivery has not landed, which returns the item to the queue at its unchanged content time. Routing it again is what a retry by hand is, so there is no route for one.",
  request: {
    params: z.object({
      record: z.string().openapi({ param: { name: "record", in: "path" } }),
    }),
  },
  responses: {
    204: { description: "Called off. The item is back in the queue." },
    404: errorResponse("No record has that id.", 404, CANCEL_STATUS),
    409: errorResponse(
      "The record has already delivered, or a host is holding a lease on it.",
      409,
      CANCEL_STATUS,
    ),
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
  queueRoute,
  archivedRoute,
  itemRoute,
  archiveRoute,
  unarchiveRoute,
  tagRoute,
  untagRoute,
  editRoute,
  markProcessedRoute,
  routingRecordsRoute,
  destinationsRoute,
  routeItemRoute,
  cancelDeliveryRoute,
  actionsRoute,
  assetUploadRoute,
  assetRoute,
  assetContentRoute,
] as const;

/** OpenAPI writes a path parameter `{id}`; Hono matches it as `:id`. */
export function honoPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}
