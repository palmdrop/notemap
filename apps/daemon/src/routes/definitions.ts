import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { JSON_MEDIA_TYPE, MAX_LIMIT } from "../constants";
import {
  ARCHIVE_STATUS,
  ASSET_STATUS,
  ASSET_STORE_STATUS,
  BODY_STATUS,
  CANCEL_STATUS,
  CAPTURE_STATUS,
  codesFor,
  DELIVERY_STATUS,
  DESTINATION_DELETION_STATUS,
  DESTINATION_STATUS,
  EDIT_STATUS,
  PARAMETER_STATUS,
  RETIRE_STATUS,
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
import {
  createDestinationRequestSchema,
  destinationDescriptionSchema,
  destinationKindsSchema,
  destinationSchema,
  destinationsSchema,
  updateDestinationRequestSchema,
} from "../schemas/destination";
import { captureEnvelopeSchema } from "../schemas/envelope";
import { errorSchema } from "../schemas/error";
import { healthSchema } from "../schemas/health";
import {
  assetSchema,
  captureOutcomeSchema,
  editOutcomeSchema,
  editEnvelopeSchema,
  itemSchema,
  itemSliceSchema,
} from "../schemas/item";
import {
  markProcessedRequestSchema,
  routeRequestSchema,
  routingRecordSchema,
  routingRecordsSchema,
} from "../schemas/routing";
import { tagRequestSchema, tagsInUseSchema } from "../schemas/tags";
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

export const healthRoute = createRoute({
  method: "get",
  path: "/v1/health",
  summary:
    "Read that the daemon is up, which pool it is serving, and its version",
  description:
    "Liveness, the pool identity, and the daemon's own version. The identity is opaque and stable for as long as that pool exists; a pool rebuilt from its mirror is a different pool and answers a different identity. The version is the release this daemon was built from, so whoever runs it can ask it rather than infer it from an image tag. This route has no refusals: a daemon that cannot answer is not answering.",
  responses: {
    200: {
      description:
        "The daemon is up, this is the pool it holds, and this is what it is.",
      content: { [JSON_MEDIA_TYPE]: { schema: healthSchema } },
    },
  },
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
    "Every item chronologically by capture time, including archived items and the items revisions were made from. Follow `next` until it is absent.",
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
    "Every item that is unprocessed — unarchived, unrouted, and nothing revised from it — oldest first by default. Paginated by a **capture-time** position, the feed's own: the queue, the feed and the archive are one ordering read through three filters.",
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

export const tagsInUseRoute = createRoute({
  method: "get",
  path: "/v1/tags",
  summary: "Read the tags the pool carries",
  description:
    "Every tag in use, most used first, so a client completing one holds the whole set and filters it itself. Not paginated and not narrowed. Every item carrying a tag is counted, archived and revised alike.",
  responses: {
    200: {
      description: "Every tag the pool carries.",
      content: { [JSON_MEDIA_TYPE]: { schema: tagsInUseSchema } },
    },
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
    422: errorResponse("The tag was declined.", 422, TAG_STATUS),
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
    422: errorResponse("The tag was declined.", 422, TAG_STATUS),
  },
});

export const editRoute = createRoute({
  method: "post",
  path: "/v1/items/{id}/edit",
  summary: "Edit an item's content",
  description:
    "Changes what the capture says. The pool decides the shape: an in-place **amendment** while the item is unprocessed, an appended **revision** once it has been routed, archived or revised. The client does not say which it wants and may hold a stale view of the item, so the outcome is read off the answer. The body is an envelope, and a revision is matched for replay on its `(source, sourceItemId)` exactly as a capture is.",
  request: {
    params: itemId,
    body: {
      required: true,
      content: { [JSON_MEDIA_TYPE]: { schema: editEnvelopeSchema } },
    },
  },
  responses: {
    200: {
      description:
        "What the edit became: the amended item, or the revision and the item it was made from.",
      content: { [JSON_MEDIA_TYPE]: { schema: editOutcomeSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    404: errorResponse("No item has that id.", 404, EDIT_STATUS),
    409: errorResponse(
      "Another item already claims the envelope's source identity.",
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

const destinationId = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});

export const destinationsRoute = createRoute({
  method: "get",
  path: "/v1/destinations",
  summary: "Read the destinations the pool holds",
  description:
    "A read of pool state: it answers at once, cannot fail, and probes nothing. Retired ones are listed, since a routing record may still name one. Not paginated: there are as many destinations as a person made. Which destinations exist is **not** stable for the life of a connection — a client re-reads rather than caching for the session.",
  responses: {
    200: {
      description: "Every destination the pool holds.",
      content: { [JSON_MEDIA_TYPE]: { schema: destinationsSchema } },
    },
  },
});

export const destinationDescriptionRoute = createRoute({
  method: "get",
  path: "/v1/destinations/{id}/description",
  summary: "Ask one destination what it can do",
  description:
    "Split from the list because they are different animals: what a destination *is* comes from the pool, and what it can *do* is I/O that may hang or fail. `described` carries the capabilities the adapter declared; `undescribable` went and looked and could not say; `unusable` could not be asked at all — no adapter speaks its kind, or its settings no longer satisfy that kind. `targetSchema` is JSON Schema and is the whole of what a client needs to build a `target`.",
  request: { params: destinationId },
  responses: {
    200: {
      description: "What it answered.",
      content: {
        [JSON_MEDIA_TYPE]: { schema: destinationDescriptionSchema },
      },
    },
    404: errorResponse("No destination has that id.", 404, DESTINATION_STATUS),
  },
});

export const destinationKindsRoute = createRoute({
  method: "get",
  path: "/v1/destination-kinds",
  summary: "Read the destination kinds this daemon has an adapter for",
  description:
    "Each with the `settingsSchema` a destination of that kind must satisfy, which is what a client builds its form from. The same arrangement as a capability's `targetSchema`, one level up: the daemon publishes what a kind needs and holds no opinion about how it is asked for.",
  responses: {
    200: {
      description: "Every kind, with the schema its settings must satisfy.",
      content: { [JSON_MEDIA_TYPE]: { schema: destinationKindsSchema } },
    },
  },
});

export const createDestinationRoute = createRoute({
  method: "post",
  path: "/v1/destinations",
  summary: "Create a destination",
  description:
    "From a name, a kind and that kind's settings. The id is minted and answered; a name is a label and need not be unique. Settings are validated against the kind's `settingsSchema` and a failure carries the schema issues.",
  request: {
    body: {
      required: true,
      content: {
        [JSON_MEDIA_TYPE]: { schema: createDestinationRequestSchema },
      },
    },
  },
  responses: {
    201: {
      description: "Created. `Location` names the destination.",
      headers: z.object({
        Location: z
          .string()
          .openapi({ example: "/v1/destinations/019a3f2c-..." }),
      }),
      content: { [JSON_MEDIA_TYPE]: { schema: destinationSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
    422: errorResponse(
      "The kind is not one this daemon has, or the settings do not satisfy it.",
      422,
      DESTINATION_STATUS,
    ),
  },
});

export const updateDestinationRoute = createRoute({
  method: "patch",
  path: "/v1/destinations/{id}",
  summary: "Change a destination's name or settings",
  description:
    "Name, settings or both, in one operation: two would leave an edit half-applied. The kind is fixed: changing it would make one destination two, and a record cannot tell which it meant. Renaming is free, because a record names the id. A half that arrives unchanged appends nothing. Last write wins.",
  request: {
    params: destinationId,
    body: {
      required: true,
      content: {
        [JSON_MEDIA_TYPE]: { schema: updateDestinationRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: "The destination as it now stands.",
      content: { [JSON_MEDIA_TYPE]: { schema: destinationSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    404: errorResponse("No destination has that id.", 404, DESTINATION_STATUS),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
    422: errorResponse(
      "The settings do not satisfy the kind's schema. Nothing was written.",
      422,
      DESTINATION_STATUS,
    ),
  },
});

export const retireDestinationRoute = createRoute({
  method: "post",
  path: "/v1/destinations/{id}/retire",
  summary: "Stop offering a destination for new routing",
  description:
    "Reversible, and nothing already decided is disturbed: records keep resolving and a pending delivery still lands. Retiring one that is already retired is refused rather than absorbed, since a second would overwrite the instant the first recorded.",
  request: { params: destinationId },
  responses: {
    200: {
      description: "The destination, now retired.",
      content: { [JSON_MEDIA_TYPE]: { schema: destinationSchema } },
    },
    404: errorResponse("No destination has that id.", 404, RETIRE_STATUS),
    409: errorResponse("It is already retired.", 409, RETIRE_STATUS),
  },
});

export const unretireDestinationRoute = createRoute({
  method: "post",
  path: "/v1/destinations/{id}/unretire",
  summary: "Offer a retired destination again",
  request: { params: destinationId },
  responses: {
    200: {
      description: "The destination, offered again.",
      content: { [JSON_MEDIA_TYPE]: { schema: destinationSchema } },
    },
    404: errorResponse("No destination has that id.", 404, RETIRE_STATUS),
    409: errorResponse("It is not retired.", 409, RETIRE_STATUS),
  },
});

export const deleteDestinationRoute = createRoute({
  method: "delete",
  path: "/v1/destinations/{id}",
  summary: "Delete a destination no record has ever named",
  description:
    "A typo need not become permanent furniture. Anything a routing record has ever named can never stop resolving, and is refused with `destination-in-use`, which names retirement as what to do instead.",
  request: { params: destinationId },
  responses: {
    204: { description: "Gone. Nothing ever named it." },
    404: errorResponse(
      "No destination has that id.",
      404,
      DESTINATION_DELETION_STATUS,
    ),
    409: errorResponse(
      "A routing record names it. Retire it instead.",
      409,
      DESTINATION_DELETION_STATUS,
    ),
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
    409: errorResponse(
      "The destination is retired, or the running code cannot make sense of it. Nothing was written.",
      409,
      DELIVERY_STATUS,
    ),
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
  method: "put",
  path: "/v1/assets/{id}",
  summary: "Upload bytes under an id the caller mints",
  description:
    "The body is the bytes, raw — not `multipart/form-data`. `Content-Type` is the asset's media type and is served back verbatim; `Content-Disposition` carries the filename, which is stored exactly as given. Anything may be uploaded; what may be rendered in place is decided on the way out. The id is the uploader's, so an upload may be repeated: the same bytes under the same name and media type answer the asset already stored.",
  request: {
    params: assetId,
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
    200: {
      description:
        "That id already names this asset. Nothing was stored, and no `Location` is sent: the caller minted it.",
      content: { [JSON_MEDIA_TYPE]: { schema: assetSchema } },
    },
    201: {
      description: "Stored. `Location` names the asset.",
      headers: z.object({
        Location: z.string().openapi({ example: "/v1/assets/0198f0c2-..." }),
      }),
      content: { [JSON_MEDIA_TYPE]: { schema: assetSchema } },
    },
    409: errorResponse(
      "That id already names an asset with different bytes, a different filename or a different media type.",
      409,
      ASSET_STORE_STATUS,
    ),
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
  healthRoute,
  captureRoute,
  feedRoute,
  queueRoute,
  archivedRoute,
  itemRoute,
  archiveRoute,
  unarchiveRoute,
  tagRoute,
  untagRoute,
  tagsInUseRoute,
  editRoute,
  markProcessedRoute,
  routingRecordsRoute,
  destinationsRoute,
  createDestinationRoute,
  destinationKindsRoute,
  destinationDescriptionRoute,
  updateDestinationRoute,
  retireDestinationRoute,
  unretireDestinationRoute,
  deleteDestinationRoute,
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
