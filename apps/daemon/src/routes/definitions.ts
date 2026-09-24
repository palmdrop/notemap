import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { JSON_MEDIA_TYPE, MAX_LIMIT } from "../constants";
import {
  ACCOUNT_STATUS,
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
  OUTPUT_STATUS,
  PARAMETER_STATUS,
  POOL_SETTING_STATUS,
  RETIRE_STATUS,
  ROUTING_STATUS,
  SUBJECT_STATUS,
  TAG_STATUS,
  UNFURL_STATUS,
  UNTAG_STATUS,
  UPLOAD_STATUS,
  TEMPLATE_STATUS,
} from "../errors/refusals";
import {
  accountKindsSchema,
  accountSchema,
  accountsSchema,
  putAccountRequestSchema,
  removedAccountSchema,
} from "../schemas/account";
import { actionSliceSchema } from "../schemas/action";
import {
  archiveRequestSchema,
  unarchiveRequestSchema,
} from "../schemas/archive";
import {
  createDestinationRequestSchema,
  destinationCandidatesSchema,
  destinationNamedSchema,
  destinationRememberedSchema,
  destinationDescriptionSchema,
  destinationKindsSchema,
  destinationProbeSchema,
  destinationSchema,
  destinationsSchema,
  updateDestinationRequestSchema,
} from "../schemas/destination";
import {
  createTemplateRequestSchema,
  resolvedTemplateSchema,
  templateReportSchema,
  templateSchema,
  templatesSchema,
  updateTemplateRequestSchema,
} from "../schemas/template";
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
  previewSchema,
  routingRecordSchema,
  routingRecordsSchema,
} from "../schemas/routing";
import {
  poolSettingsSchema,
  updatePoolSettingsRequestSchema,
} from "../schemas/settings";
import { unfurlQuery, unfurlSchema } from "../schemas/unfurl";
import { sourcesInUseSchema } from "../schemas/sources";
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
  kind: z
    .string()
    .optional()
    .openapi({
      param: { name: "kind", in: "query" },
      description:
        "Narrows the read to entries of these kinds, comma-separated. One that is not a kind is refused with `422 bad-kind`.",
      example: "routed,delivery-failed",
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

export const sourcesInUseRoute = createRoute({
  method: "get",
  path: "/v1/sources",
  summary: "Read the sources the pool has captured from",
  description:
    "Every source an item in the pool came in through, most recently captured first, with how many items it captured and when the newest of them was captured. Not paginated and not narrowed. A source is discovered rather than declared, so this is derived from the items themselves and a source with no items left is not answered.",
  responses: {
    200: {
      description: "Every source the pool has an item from.",
      content: { [JSON_MEDIA_TYPE]: { schema: sourcesInUseSchema } },
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
    "Adds one tag. Classification does not move an item, so a tagged item keeps its place in the queue — unless the tag is a **trigger tag**, which applies the routing template that declared it and takes the item out of the queue by reserving a delivery. The reservation and the tag commit together, and the delivery is enqueued a configured window later rather than attempted here, so it can still be cancelled.\n\nFiring is on the tagging: a tag the item already carries is absorbed rather than refused — keeping the attribution and time it has, since a tag's name is the whole of the request — and absorbing one fires nothing.\n\nA trigger tag whose template cannot route is `422 trigger-refused` and **nothing is written, the tag included**: a tag that filed nothing is spent, because re-applying it would be absorbed. A destination that merely could not be reached is not that — the reservation is made and the delivery waits.",
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
    "Removes one tag. A tag the item does not carry is absorbed rather than refused, on the same terms as adding one it already has. Untagging does not unroute, and removing a trigger tag fires nothing.\n\nA **trigger tag that filed this item is refused** while what it filed still stands: `409 trigger-tag-held`, naming the template and the record. Putting such a tag back would file a second copy rather than undo the first, so the way back is to cancel the record — which removes the reservation and gives the tag with it.",
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
    404: errorResponse("No item has that id.", 404, UNTAG_STATUS),
    409: errorResponse(
      "The tag filed this item, and what it filed still stands.",
      409,
      UNTAG_STATUS,
    ),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
    422: errorResponse("The tag was declined.", 422, UNTAG_STATUS),
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
      example: "create",
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

const namedQuery = z.object({
  capability: z
    .string()
    .min(1)
    .openapi({
      param: { name: "capability", in: "query" },
      description: "One the destination declared. Anything else is refused.",
      example: "create",
    }),
  field: z
    .string()
    .min(1)
    .openapi({
      param: { name: "field", in: "query" },
      description:
        "A property of that capability's `argumentsSchema` carrying `x-notemap-candidates`. Anything else is refused.",
      example: "channel",
    }),
  value: z.string().openapi({
    param: { name: "value", in: "query" },
    description:
      "What the field holds, in whichever of an entry's forms it ended up holding — a destination that answers for one answers for both. Empty names nothing.",
    example: "12345",
  }),
});

export const destinationNamedRoute = createRoute({
  method: "get",
  path: "/v1/destinations/{id}/named",
  summary: "Ask one destination what a value its field holds is called",
  description:
    "`/candidates` asks what a field could hold and answers a page; this asks what one thing it holds is called and answers one entry. Separate because a page is capped and may be truncated, and a value a surface is already holding is exactly the one a truncated page may never mention — a routing template pinned to an are.na channel outside the first page has no name in the browse, and this is the only way to read one back. The same checks `/candidates` makes, made here for the same reason. An `answered` carrying no `entry` is a true answer: the destination has nothing by that name, which is what a place typed by hand looks like.",
  request: { params: destinationId, query: namedQuery },
  responses: {
    200: {
      description:
        "What it answered: the entry, nothing by that name, a refusal the destination itself gave, or a kind that does not offer this.",
      content: { [JSON_MEDIA_TYPE]: { schema: destinationNamedSchema } },
    },
    404: errorResponse("No destination has that id.", 404, DESTINATION_STATUS),
    422: errorResponse(
      "The capability was not declared, or the field is not one that can be asked about.",
      422,
      CANDIDATES_REQUEST_STATUS,
    ),
  },
});

export const destinationProbeRoute = createRoute({
  method: "get",
  path: "/v1/destinations/{id}/probe",
  summary: "Ask one destination whether it is really there",
  description:
    "The third read that reaches the outside world, and the only one that answers what a person means by \"does this work\": `/description` answers from a destination's declared shape and never leaves the process, so an unmounted drive and an account nobody declared both describe themselves without complaint. `ready` was reached, took the credential and had its root; `rejected` answered and said no, which is a person's to fix; `unreachable` could not be reached or could not decide, which a retry may find different; `unusable` could not be asked at all; `not-offered` is a kind that does not do this. Nothing is written to find out, so `ready` does not promise a write will land.",
  request: { params: destinationId },
  responses: {
    200: {
      description: "What it answered.",
      content: { [JSON_MEDIA_TYPE]: { schema: destinationProbeSchema } },
    },
    404: errorResponse("No destination has that id.", 404, DESTINATION_STATUS),
  },
});

const rememberedQuery = z.object({
  capability: z
    .string()
    .min(1)
    .openapi({
      param: { name: "capability", in: "query" },
      description:
        "Which capability's records to read. One nothing was ever routed with answers no places.",
      example: "create-or-append",
    }),
  field: z
    .string()
    .min(1)
    .openapi({
      param: { name: "field", in: "query" },
      description:
        "A property of that capability's arguments. One no record carries answers no places.",
      example: "path",
    }),
});

export const destinationRememberedRoute = createRoute({
  method: "get",
  path: "/v1/destinations/{id}/remembered",
  summary: "Read what a field has already held on one destination",
  description:
    "The same question `/candidates` asks, answered from the other side: `/candidates` says what the destination offers, this says what the pool's own routing records have used, with how often and when last. **Nothing goes and looks**, so it answers whether or not the destination can be reached — which is most of what makes a place still typeable against an unmounted drive. Facts and not an order: which to put first is presentation, and belongs to whatever draws it. Per destination, never pool-wide, because a place in one vault means nothing in another. A `delivered` record counts outright; a `pending` one counts unless its delivery was abandoned. Capped rather than paginated, on the same terms `/candidates` is.",
  request: { params: destinationId, query: rememberedQuery },
  responses: {
    200: {
      description: "Every distinct value the field has held, capped.",
      content: { [JSON_MEDIA_TYPE]: { schema: destinationRememberedSchema } },
    },
    404: errorResponse("No destination has that id.", 404, DESTINATION_STATUS),
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

const templateId = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});

export const templatesRoute = createRoute({
  method: "get",
  path: "/v1/templates",
  summary: "Read the routing templates the pool holds",
  description:
    "A saved routing decision: a destination, a capability, the arguments as patterns, how its folder is treated, and the tag that applies it. A read of pool state, on `/v1/destinations`' terms — it answers at once, cannot fail, and asks the destination nothing. Not paginated: there are as many templates as a person made.",
  responses: {
    200: {
      description: "Every template the pool holds, oldest first.",
      content: { [JSON_MEDIA_TYPE]: { schema: templatesSchema } },
    },
  },
});

export const createTemplateRoute = createRoute({
  method: "post",
  path: "/v1/templates",
  summary: "Save a routing decision",
  description:
    "The arguments may hold patterns — `{{captured_at}}`, `{{item}}` — which the pool expands when a decision is made. A field or a format nobody named is refused **here**, when it is written, rather than by a delivery next week: what saves expands for every item there will ever be. A trigger tag must sit under `route/` and may be claimed by one template only.",
  request: {
    body: {
      required: true,
      content: { [JSON_MEDIA_TYPE]: { schema: createTemplateRequestSchema } },
    },
  },
  responses: {
    201: {
      description: "Created. `Location` names the template.",
      headers: z.object({
        Location: z.string().openapi({ example: "/v1/templates/019a3f2c-..." }),
      }),
      content: { [JSON_MEDIA_TYPE]: { schema: templateSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    409: errorResponse(
      "Another template already claims that trigger tag.",
      409,
      TEMPLATE_STATUS,
    ),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
    422: errorResponse(
      "The destination, the trigger tag or a pattern was refused. Nothing was written.",
      422,
      TEMPLATE_STATUS,
    ),
  },
});

export const updateTemplateRoute = createRoute({
  method: "patch",
  path: "/v1/templates/{id}",
  summary: "Change a routing template",
  description:
    "Every field a person supplied, in one operation. `triggerTag: null` takes the tag off, which absence cannot say. Editing the arguments clears the establishment, since a changed place is a different place; renaming moves nothing and keeps it.",
  request: {
    params: templateId,
    body: {
      required: true,
      content: { [JSON_MEDIA_TYPE]: { schema: updateTemplateRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "The template as it now stands.",
      content: { [JSON_MEDIA_TYPE]: { schema: templateSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    404: errorResponse("No template has that id.", 404, TEMPLATE_STATUS),
    409: errorResponse(
      "Another template already claims that trigger tag.",
      409,
      TEMPLATE_STATUS,
    ),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
    422: errorResponse(
      "The destination, the trigger tag or a pattern was refused. Nothing was written.",
      422,
      TEMPLATE_STATUS,
    ),
  },
});

export const deleteTemplateRoute = createRoute({
  method: "delete",
  path: "/v1/templates/{id}",
  summary: "Delete a routing template",
  description:
    "Deleted rather than retired: a template names nothing that outlives it, and a record made from one carries what it routed as and keeps resolving without it.",
  request: { params: templateId },
  responses: {
    204: { description: "Gone." },
    404: errorResponse("No template has that id.", 404, TEMPLATE_STATUS),
  },
});

export const templateReportRoute = createRoute({
  method: "get",
  path: "/v1/templates/{id}/report",
  summary: "Ask whether a template's destination can still support it",
  description:
    "Split from the list on `/v1/destinations/{id}/description`'s terms: what a template *is* comes from the pool, and whether it still *works* is I/O that may hang. `fits` is the answer with nothing wrong. `stranded` is a destination that was deleted. `unreachable` is **cannot say**, which is not the same fact as anything else here — a sleeping vault is an ordinary condition and must not be drawn as an alarm. `folder-missing` is asked only where the template promised the folder would be there.",
  request: { params: templateId },
  responses: {
    200: {
      description: "What it answered.",
      content: { [JSON_MEDIA_TYPE]: { schema: templateReportSchema } },
    },
    404: errorResponse("No template has that id.", 404, TEMPLATE_STATUS),
  },
});

export const resolveTemplateRoute = createRoute({
  method: "get",
  path: "/v1/items/{id}/route/resolve",
  summary: "Ask what a template would route this item as",
  description:
    "The destination, the capability and the **expanded** arguments, reserving nothing. A different question from `/route/preview`, which answers bytes: this answers where. It is what lets a composer draw the filename before the commit, from the one expander, rather than reimplementing it on the other side of the wire.",
  request: {
    params: itemId,
    query: z.object({
      template: z
        .string()
        .min(1)
        .openapi({
          param: { name: "template", in: "query" },
          description: "One of the ids `GET /v1/templates` reports.",
        }),
    }),
  },
  responses: {
    200: {
      description: "What routing it now would record.",
      content: { [JSON_MEDIA_TYPE]: { schema: resolvedTemplateSchema } },
    },
    404: errorResponse("No item has that id, or no template does.", 404, {
      ...ROUTING_STATUS,
      ...TEMPLATE_STATUS,
    }),
  },
});

export const routeItemRoute = createRoute({
  method: "post",
  path: "/v1/items/{id}/route",
  summary: "Route an item to a destination, or from a template",
  description:
    "Records the decision and attempts the delivery once, inline. **The record answered may name a delivery that has not happened**: `state` is `pending` when the destination could not be reached, and a job carries it out later. A destination that was reached and refused writes nothing.\n\nOne route, two bodies, because it is one decision either way: a destination with its capability and arguments, or a template that already holds all three. From a template the arguments are expanded first, so the record names a place a person can read.",
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

export const previewRouteRoute = createRoute({
  method: "post",
  path: "/v1/items/{id}/route/preview",
  summary: "Ask what a destination would write, before committing to it",
  description:
    "Takes exactly what `/route` takes and answers what would be written instead of writing it. **A `POST` that changes nothing**: no routing record, no delivery job, nothing in the action log, and nothing at the destination beyond whatever it had to read to answer. It is a `POST` because the question carries a body — the capability's arguments are an object of the destination's own shape, which a query string cannot carry honestly.\n\n**The answer is indicative, never binding.** The delivery converts again when it runs, so where a destination's converter is not deterministic the two will differ; that is a fact about the destination rather than a fault. The content comes back inline and as text, because a preview is stored nowhere and there is no second fetch to point at.\n\nIt is refused for the reasons `/route` is refused, because a preview that answered where a route would refuse would be describing a decision nobody can make. `unreachable` and `not-offered` are answers rather than refusals: neither stops the decision being made, only the seeing of it.",
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
        "What it would write, why it would refuse, why it could not be reached, or a kind that does not offer this.",
      content: { [JSON_MEDIA_TYPE]: { schema: previewSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request.",
      400,
      BODY_STATUS,
    ),
    404: errorResponse("No item has that id.", 404, ROUTING_STATUS),
    409: errorResponse(
      "The destination is retired, or the running code cannot make sense of it.",
      409,
      DELIVERY_STATUS,
    ),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
    422: errorResponse(
      "The destination, the capability, the payload type or the arguments were declined.",
      422,
      DELIVERY_STATUS,
    ),
  },
});

export const routingOutputRoute = createRoute({
  method: "get",
  path: "/v1/routing/{record}/output",
  summary: "Read what a delivery produced",
  description:
    "The bytes the destination said it wrote, in the media type the record names. A separate fetch because an output may be large, and the record itself answers only whether there is one. Carries the inert headers an asset's bytes carry, for the same reason: this is content a destination produced, served from the daemon's own origin. `ETag` is the blob, and the response is immutable — a delivered record never changes what it produced.",
  request: {
    params: z.object({
      record: z.string().openapi({ param: { name: "record", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "The bytes.",
      headers: z.object({
        ETag: z.string().openapi({ example: '"e3b0c44298fc1c14..."' }),
        "Content-Disposition": z
          .string()
          .openapi({ example: 'inline; filename="output.md"' }),
      }),
      content: { "*/*": { schema: z.string().openapi({ format: "binary" }) } },
    },
    404: errorResponse(
      "No record has that id, the record produced no output, or its blob is gone from disk. A record with no output is ordinary rather than a fault.",
      404,
      OUTPUT_STATUS,
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

const accountAddress = z.object({
  kind: z.string().openapi({ param: { name: "kind", in: "path" } }),
  name: z.string().openapi({ param: { name: "name", in: "path" } }),
});

const ACCOUNT_SESSION_ONLY = errorResponse(
  "Authenticated by an access token. Accounts are managed from a signed-in browser alone: whoever writes one can aim the daemon at any address with a password attached.",
  403,
  AUTH_STATUS,
);

export const accountKindsRoute = createRoute({
  method: "get",
  path: "/v1/account-kinds",
  summary: "Read the kinds that hold an account",
  description:
    "Each with the `accountSchema` an account of that kind must satisfy besides its secret, which is what a client builds its form from. The same arrangement as `GET /v1/destination-kinds`. **A session is required.**",
  responses: {
    200: {
      description: "Every kind that holds an account.",
      content: { [JSON_MEDIA_TYPE]: { schema: accountKindsSchema } },
    },
    403: ACCOUNT_SESSION_ONLY,
  },
});

export const accountsRoute = createRoute({
  method: "get",
  path: "/v1/accounts",
  summary: "Read the accounts the daemon can reach other systems with",
  description:
    "Every account, from config and held by the daemon alike, with the fields beside its secret. **No route answers a secret, ever**: `secretSet` says whether there is one, and that is all. A config account a stored one replaces is listed with `shadowed`, so it is never silently dropped. **A session is required.**",
  responses: {
    200: {
      description: "Every account.",
      content: { [JSON_MEDIA_TYPE]: { schema: accountsSchema } },
    },
    403: ACCOUNT_SESSION_ONLY,
  },
});

export const putAccountRoute = createRoute({
  method: "put",
  path: "/v1/accounts/{kind}/{name}",
  summary: "Create or replace an account held by the daemon",
  description:
    "Stored in the daemon's own database, beside the credential and never in the pool, so it is neither answered by any other route nor written to the mirror. The secret is stored as given: it is presented to another system, so unlike a password it cannot be hashed. A stored account replaces a config one of the same kind and name entirely. Leaving `secret` out keeps the one already held, and is refused where none is. **A session is required.**",
  request: {
    params: accountAddress,
    body: {
      required: true,
      content: { [JSON_MEDIA_TYPE]: { schema: putAccountRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "Stored. Without its secret.",
      content: { [JSON_MEDIA_TYPE]: { schema: accountSchema } },
    },
    400: errorResponse("The body could not be read.", 400, BODY_STATUS),
    403: ACCOUNT_SESSION_ONLY,
    404: errorResponse(
      "No kind of that name holds an account.",
      404,
      ACCOUNT_STATUS,
    ),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
    422: errorResponse(
      "The fields do not satisfy the kind's `accountSchema`, or no secret is held or given.",
      422,
      ACCOUNT_STATUS,
    ),
  },
});

export const removeAccountRoute = createRoute({
  method: "delete",
  path: "/v1/accounts/{kind}/{name}",
  summary: "Forget an account held by the daemon",
  description:
    "Removes the stored account. A config account of the same kind and name is used again, and answered as `revealed`. Where there is none, removal is refused while a destination that is not retired names the account. A config account cannot be removed here. **A session is required.**",
  request: { params: accountAddress },
  responses: {
    200: {
      description: "Forgotten.",
      content: { [JSON_MEDIA_TYPE]: { schema: removedAccountSchema } },
    },
    403: ACCOUNT_SESSION_ONLY,
    404: errorResponse(
      "No stored account has that kind and name.",
      404,
      ACCOUNT_STATUS,
    ),
    409: errorResponse(
      "A destination that is not retired still names it.",
      409,
      ACCOUNT_STATUS,
    ),
  },
});

export const poolSettingsRoute = createRoute({
  method: "get",
  path: "/v1/settings",
  summary: "Read the pool's own settings",
  description:
    "Every setting this daemon knows, with its effective value — a name never changed reads as its own default. The bare path is right: one daemon serves one pool, and a destination's settings are reached at `/v1/destinations/{id}` instead, so nothing else is addressable here.",
  responses: {
    200: {
      description: "Every known pool setting.",
      content: { [JSON_MEDIA_TYPE]: { schema: poolSettingsSchema } },
    },
  },
});

export const updatePoolSettingsRoute = createRoute({
  method: "patch",
  path: "/v1/settings",
  summary: "Change one of the pool's own settings",
  description:
    'The body names exactly one setting — `{ "unfurl": false }` — so two callers changing two different settings never clobber each other, and a refusal never follows a change that already landed. Answers the full list, on `GET`\'s terms.',
  request: {
    body: {
      required: true,
      content: {
        [JSON_MEDIA_TYPE]: { schema: updatePoolSettingsRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Every known pool setting, as it now stands.",
      content: { [JSON_MEDIA_TYPE]: { schema: poolSettingsSchema } },
    },
    400: errorResponse(
      "The body could not be read as this request, or did not name exactly one setting.",
      400,
      BODY_STATUS,
    ),
    404: errorResponse(
      "The name is not one this daemon knows.",
      404,
      POOL_SETTING_STATUS,
    ),
    415: errorResponse("The body was not JSON.", 415, BODY_STATUS),
    422: errorResponse(
      "The value is not of the setting's type.",
      422,
      POOL_SETTING_STATUS,
    ),
  },
});

export const unfurlRoute = createRoute({
  method: "get",
  path: "/v1/unfurl",
  summary: "Read what an external link points at",
  description:
    "The daemon reads the page's head and answers its title, description, image and site name — Open Graph first, then the common tags pages use instead (`twitter:`, `description`, `application-name`, `image_src`), then the document's `<title>`. Indicative: held in memory for an hour (a failure for minutes), never pool state. Only a public address is fetched — every hop of a redirect is checked, and the connection is made to the address that was checked. A target that could not be read is an ordinary answer with `reached: false`, not a refusal. Refused outright while the `unfurl` pool setting is off.",
  request: { query: unfurlQuery },
  responses: {
    200: {
      description:
        "What the page says about itself, or that nothing could be read.",
      content: { [JSON_MEDIA_TYPE]: { schema: unfurlSchema } },
    },
    409: errorResponse("The `unfurl` pool setting is off.", 409, UNFURL_STATUS),
    422: errorResponse(
      "The address is not `http` or `https`, carries credentials, or is not one the daemon will fetch.",
      422,
      UNFURL_STATUS,
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
  accountKindsRoute,
  accountsRoute,
  putAccountRoute,
  removeAccountRoute,
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
  sourcesInUseRoute,
  editRoute,
  markProcessedRoute,
  routingRecordsRoute,
  destinationsRoute,
  createDestinationRoute,
  destinationKindsRoute,
  destinationDescriptionRoute,
  destinationCandidatesRoute,
  destinationNamedRoute,
  destinationProbeRoute,
  destinationRememberedRoute,
  updateDestinationRoute,
  retireDestinationRoute,
  unretireDestinationRoute,
  deleteDestinationRoute,
  templatesRoute,
  createTemplateRoute,
  templateReportRoute,
  updateTemplateRoute,
  deleteTemplateRoute,
  resolveTemplateRoute,
  routeItemRoute,
  previewRouteRoute,
  cancelDeliveryRoute,
  routingOutputRoute,
  actionsRoute,
  assetUploadRoute,
  assetRoute,
  assetContentRoute,
  poolSettingsRoute,
  updatePoolSettingsRoute,
  unfurlRoute,
] as const;

/** OpenAPI writes a path parameter `{id}`; Hono matches it as `:id`. */
export function honoPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}
