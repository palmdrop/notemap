import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { JSON_MEDIA_TYPE, MAX_LIMIT } from "../constants";
import {
  ARCHIVE_STATUS,
  AUTH_STATUS,
  ASSET_STATUS,
  ASSET_STORE_STATUS,
  BODY_STATUS,
  CANCEL_STATUS,
  CANDIDATES_REQUEST_STATUS,
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
  destinationCandidatesSchema,
  destinationDescriptionSchema,
  destinationKindsSchema,
  destinationSchema,
  destinationsSchema,
  updateDestinationRequestSchema,
} from "../schemas/destination";
import { captureEnvelopeSchema } from "../schemas/envelope";
import { errorSchema } from "../schemas/error";
import { loginRequestSchema, sessionSchema } from "../schemas/session";
import {
  mintTokenRequestSchema,
  mintedTokenSchema,
  tokensSchema,
} from "../schemas/token";
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
    "Liveness, the daemon's own version, and — to a caller the daemon knows — the pool identity. Open on purpose: the shell probes it to tell a closed door from a daemon that is down, and a `401` here would make the two look alike. `pool` is omitted where a password is set and nothing was presented, because which pool this is, is a fact about the pool; a daemon nobody has set a password on answers it to everyone, as it always did. The identity is opaque and stable for as long as that pool exists; a pool rebuilt from its mirror is a different pool and answers a different identity. This route has no refusals: a daemon that cannot answer is not answering.",
  responses: {
    200: {
      description:
        "The daemon is up, this is the pool it holds, and this is what it is.",
      content: { [JSON_MEDIA_TYPE]: { schema: healthSchema } },
    },
  },
});

const tokenId = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});

export const loginRoute = createRoute({
  method: "post",
  path: "/v1/session",
  summary: "Sign in and take a session",
  description:
    "Exchanges the credential for a session cookie. The cookie is `HttpOnly` and carries the only copy of the session's secret; the daemon stores a hash of it and can never reproduce it. Answered the same way whether the name or the password was wrong, so neither can be probed for.",
  request: {
    body: {
      required: true,
      content: { [JSON_MEDIA_TYPE]: { schema: loginRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "Signed in. The session cookie is set.",
      content: { [JSON_MEDIA_TYPE]: { schema: sessionSchema } },
    },
    400: errorResponse("The body could not be read.", 400, BODY_STATUS),
    401: errorResponse(
      "The credential was not accepted. Which half was wrong is not said.",
      401,
      AUTH_STATUS,
    ),
    429: errorResponse("Too many attempts.", 429, AUTH_STATUS),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
  },
});

export const sessionRoute = createRoute({
  method: "get",
  path: "/v1/session",
  summary: "Read who this request is, if anyone",
  description:
    "Open, and answers 200 whether or not anyone is signed in — being signed out is an answer rather than a refusal, and a client needs to tell it apart from a daemon that is unreachable. `requiresCredentials` is false on a daemon nobody has set a password on, where every request is let through.",
  responses: {
    200: {
      description: "What this request is, and whether this daemon asks at all.",
      content: { [JSON_MEDIA_TYPE]: { schema: sessionSchema } },
    },
  },
});

export const logoutRoute = createRoute({
  method: "delete",
  path: "/v1/session",
  summary: "Sign out",
  description:
    "Ends the session the cookie names and clears the cookie. Idempotent, and open: signing out with a session that already lapsed is not an error, it is the same outcome arrived at early.",
  responses: {
    204: { description: "Signed out, whether or not there was a session." },
    422: errorResponse(
      "Authenticated by an access token, which is not a session to end.",
      422,
      AUTH_STATUS,
    ),
  },
});

export const endAllSessionsRoute = createRoute({
  method: "delete",
  path: "/v1/sessions",
  summary: "End every session, everywhere",
  description:
    "What a person reaches for after losing a device: every session is ended at once, including this one. Access tokens are untouched — a headless client is not a device someone left on a train, and revoking one is its own deliberate act. Behind the door, unlike signing out of this session alone, and **a session is required**: signing every browser out is what someone does so that a leak is noticed, so a leaked token may not be the thing that does it.",
  responses: {
    204: { description: "Every session is over." },
    401: errorResponse("Nothing valid was presented.", 401, AUTH_STATUS),
    403: errorResponse(
      "Authenticated by an access token, which may not end sessions.",
      403,
      AUTH_STATUS,
    ),
  },
});

export const tokensRoute = createRoute({
  method: "get",
  path: "/v1/tokens",
  summary: "Read the access tokens that exist",
  description:
    "Names, times and last use. **No secret is ever listed**: the token string is shown once when it is minted and is not stored. `lastUsedAt` is what says whether a token is still in use and safe to revoke.",
  responses: {
    200: {
      description: "Every token this daemon holds.",
      content: { [JSON_MEDIA_TYPE]: { schema: tokensSchema } },
    },
    403: errorResponse(
      "Authenticated by an access token, which may not manage tokens.",
      403,
      AUTH_STATUS,
    ),
  },
});

export const mintTokenRoute = createRoute({
  method: "post",
  path: "/v1/tokens",
  summary: "Mint an access token",
  description:
    "**The only answer that carries the token string.** It is not stored and cannot be read back, so a token that was not written down is replaced rather than recovered. Leaving `expiresAt` out mints one that never expires.",
  request: {
    body: {
      required: true,
      content: { [JSON_MEDIA_TYPE]: { schema: mintTokenRequestSchema } },
    },
  },
  responses: {
    201: {
      description: "Minted. `token` is shown here and nowhere else.",
      content: { [JSON_MEDIA_TYPE]: { schema: mintedTokenSchema } },
    },
    400: errorResponse("The body could not be read.", 400, BODY_STATUS),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
    403: errorResponse(
      "Authenticated by an access token, which may not manage tokens.",
      403,
      AUTH_STATUS,
    ),
  },
});

export const revokeTokenRoute = createRoute({
  method: "delete",
  path: "/v1/tokens/{id}",
  summary: "Revoke an access token",
  description:
    "Takes effect on the next request: nothing caches an authentication, so there is no window to outrun. Revoking a token that is already gone is not an error.",
  request: { params: tokenId },
  responses: {
    204: { description: "Revoked, or was never there." },
    403: errorResponse(
      "Authenticated by an access token, which may not manage tokens.",
      403,
      AUTH_STATUS,
    ),
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
    "Split from the list because they are different animals: what a destination *is* comes from the pool, and what it can *do* is I/O that may hang or fail. `described` carries the capabilities the adapter declared; `undescribable` went and looked and could not say; `unusable` could not be asked at all — no adapter speaks its kind, or its settings no longer satisfy that kind. `argumentsSchema` is JSON Schema and is the whole of what a client needs to build `arguments`.",
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

const candidatesQuery = z.object({
  capability: z
    .string()
    .min(1)
    .openapi({
      param: { name: "capability", in: "query" },
      description: "One the destination declared. Anything else is refused.",
      example: "create-file",
    }),
  field: z
    .string()
    .min(1)
    .openapi({
      param: { name: "field", in: "query" },
      description:
        "A property of that capability's `argumentsSchema` carrying `x-notemap-candidates`. Anything else is refused.",
      example: "directory",
    }),
  scope: z
    .string()
    .optional()
    .openapi({
      param: { name: "scope", in: "query" },
      description:
        "Opaque. Absent asks at the top; present is a scope an earlier answer minted, to descend without being told it is descending anything.",
      example: "inbox",
    }),
});

export const destinationCandidatesRoute = createRoute({
  method: "get",
  path: "/v1/destinations/{id}/candidates",
  summary:
    "Ask one destination what a field of one capability's arguments could hold",
  description:
    "The same animal as `/description`: a question the destination answers, slowly, and may refuse. Capped rather than paginated — `truncated` says when it cut the answer short, because a folder holding thousands of notes is a search problem rather than a paging one, and a cursor would put a position on an ordering notemap does not own. The capability and the field are checked against what `/description` already declares before the destination is asked anything: an undeclared capability or a field not carrying `x-notemap-candidates` is refused on the route's own terms.",
  request: { params: destinationId, query: candidatesQuery },
  responses: {
    200: {
      description:
        "What it answered: entries, a refusal the destination itself gave, or a kind that does not offer this.",
      content: { [JSON_MEDIA_TYPE]: { schema: destinationCandidatesSchema } },
    },
    404: errorResponse("No destination has that id.", 404, DESTINATION_STATUS),
    422: errorResponse(
      "The capability was not declared, or the field is not one that can be asked about.",
      422,
      CANDIDATES_REQUEST_STATUS,
    ),
  },
});

export const destinationKindsRoute = createRoute({
  method: "get",
  path: "/v1/destination-kinds",
  summary: "Read the destination kinds this daemon has an adapter for",
  description:
    "Each with the `settingsSchema` a destination of that kind must satisfy, which is what a client builds its form from. The same arrangement as a capability's `argumentsSchema`, one level up: the daemon publishes what a kind needs and holds no opinion about how it is asked for.",
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
      "The destination, the capability, the payload type or the arguments were declined. Nothing was written.",
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
  loginRoute,
  sessionRoute,
  logoutRoute,
  endAllSessionsRoute,
  tokensRoute,
  mintTokenRoute,
  revokeTokenRoute,
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
  destinationCandidatesRoute,
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
