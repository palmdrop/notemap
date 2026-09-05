import type {
  ArchiveRefusal,
  AssetRefusal,
  AssetStoreRefusal,
  CancelRefusal,
  CaptureRefusal,
  DeliveryRefusal,
  DestinationDeletionRefusal,
  DestinationRefusal,
  EditRefusal,
  OutputRefusal,
  RetireRefusal,
  RoutingRefusal,
  RoutingTemplateRefusal,
  TagRefusal,
  TemplateRoutingRefusal,
} from "@notemap/core";

import type { DaemonRefusal, ErrorBody } from "../types";

export type StatusMap = Readonly<Record<string, number>>;

/** `409` is a conflict with what the pool holds; `422` is anything else it declined. */
export const CAPTURE_STATUS = {
  "capture-id-conflict": 409,
  "source-item-changed": 409,
  "unknown-payload-type": 422,
  "payload-invalid": 422,
  "missing-asset-slot": 422,
  "unknown-asset": 422,
} as const satisfies Record<CaptureRefusal["kind"], number>;

/** Anything wrong with the request body itself. */
export const BODY_STATUS = {
  "malformed-json": 400,
  "malformed-envelope": 400,
  "unsupported-media-type": 415,
} as const;

/**
 * What the daemon itself refuses about an upload. `413` is the one status
 * outside the rule the rest of the table follows, and deliberately: a size
 * limit is a fact the transport layer already acts on, and hiding it inside a
 * `422` costs a client the chance to stop an upload early.
 */
export const UPLOAD_STATUS = {
  "missing-filename": 422,
  "bad-digest": 422,
  "digest-mismatch": 422,
  "asset-too-large": 413,
} as const;

/** Reading an asset. Both are `404`, distinguished by code: a read never rehashes, so drift cannot arise. */
export const ASSET_STATUS = {
  "no-such-asset": 404,
  "blob-missing": 404,
} as const satisfies Record<AssetRefusal["kind"], number>;

/** `409` by the rule: the id is a conflict with something the pool already holds. */
export const ASSET_STORE_STATUS = {
  "asset-id-conflict": 409,
} as const satisfies Record<AssetStoreRefusal["kind"], number>;

/** `item-purged` is part of the refusal a client parses; purge is not built. */
export const ARCHIVE_STATUS = {
  "no-such-item": 404,
  "item-purged": 404,
  "already-archived": 409,
  "not-archived": 409,
} as const satisfies Record<ArchiveRefusal["kind"], number>;

/** Both halves absorb a call for what the item already says, so nothing else declines. */
export const TAG_STATUS = {
  "no-such-item": 404,
  "item-purged": 404,
  "tag-invalid": 422,
} as const satisfies Record<TagRefusal["kind"], number>;

/**
 * `source-item-changed` is `409` on capture's terms: the envelope's identity
 * names an item the pool already holds and did not revise from this one. The
 * rest are `422`, the request having been understood and declined.
 */
export const EDIT_STATUS = {
  "no-such-item": 404,
  "item-purged": 404,
  "source-item-changed": 409,
  "payload-invalid": 422,
  "payload-type-changed": 422,
  "missing-asset-slot": 422,
  "unknown-asset": 422,
} as const satisfies Record<EditRefusal["kind"], number>;

export const ROUTING_STATUS = {
  "no-such-item": 404,
  "item-purged": 404,
} as const satisfies Record<RoutingRefusal["kind"], number>;

/**
 * Routing to a destination. Everything the pool understood and declined is
 * `422`.
 *
 * `unreachable` is here and cannot be raised: a destination that was never
 * reached answers `200` with a pending record. It is part of the union a client
 * parses, so it is part of the table.
 */
export const DELIVERY_STATUS = {
  "no-such-item": 404,
  "item-purged": 404,
  "unknown-destination": 422,
  "capability-undeclared": 422,
  "payload-type-unsupported": 422,
  "arguments-invalid": 422,
  "rejected-by-destination": 422,
  "delivery-outcome-unknown": 422,
  unreachable: 422,
  "destination-retired": 409,
  "destination-unusable": 409,
} as const satisfies Record<DeliveryRefusal["kind"], number>;

/** `404` is the id itself; `422` is what it was asked to hold. */
export const DESTINATION_STATUS = {
  "unknown-destination": 404,
  "unknown-destination-kind": 422,
  "invalid-destination-settings": 422,
} as const satisfies Record<DestinationRefusal["kind"], number>;

/** Retirement carries the instant it happened, which a second one would overwrite. */
export const RETIRE_STATUS = {
  "unknown-destination": 404,
  "already-retired": 409,
  "not-retired": 409,
} as const satisfies Record<RetireRefusal["kind"], number>;

/** `409` names retirement as what to do instead of deleting. */
export const DESTINATION_DELETION_STATUS = {
  "unknown-destination": 404,
  "destination-in-use": 409,
} as const satisfies Record<DestinationDeletionRefusal["kind"], number>;

/**
 * Saving a template. `404` is the id itself; `409` is a trigger tag another
 * template already claims, which is a conflict with what the pool holds; the
 * rest are `422`, the request having been understood and declined.
 */
export const TEMPLATE_STATUS = {
  "unknown-template": 404,
  "unknown-destination": 422,
  "trigger-tag-invalid": 422,
  "trigger-tag-unreserved": 422,
  "trigger-tag-taken": 409,
  "unknown-pattern-field": 422,
  "unknown-pattern-format": 422,
} as const satisfies Record<RoutingTemplateRefusal["kind"], number>;

/** Routing from one: delivery's own table, plus the template that is not there. */
export const TEMPLATE_ROUTING_STATUS = {
  ...DELIVERY_STATUS,
  "unknown-template": 404,
} as const satisfies Record<TemplateRoutingRefusal["kind"], number>;

/** The two `409`s conflict with state the caller can already read — a record that has landed, and one somebody holds a lease on. */
export const CANCEL_STATUS = {
  "no-such-record": 404,
  "not-pending": 409,
  "delivery-in-flight": 409,
} as const satisfies Record<CancelRefusal["kind"], number>;

/**
 * Reading what a delivery produced. All three are `404`, distinguished by code:
 * a record with no output is ordinary rather than a fault, and nothing else in
 * the domain has a state for it.
 */
export const OUTPUT_STATUS = {
  "no-such-record": 404,
  "no-output": 404,
  "blob-missing": 404,
} as const satisfies Record<OutputRefusal["kind"], number>;

export function outputStatus(refusal: OutputRefusal): number {
  return OUTPUT_STATUS[refusal.kind];
}

/** Anything wrong with a query parameter. */
export const PARAMETER_STATUS = {
  "limit-too-large": 422,
  "bad-limit": 422,
  "bad-order": 422,
  "bad-position": 422,
} as const;

export const SUBJECT_STATUS = { "no-such-item": 404 } as const;

/**
 * The route's own check on `GET /v1/destinations/{id}/candidates`, on the same
 * terms `capability-undeclared` is refused when routing an item: the request
 * was understood and declined before the destination was asked anything.
 */
export const CANDIDATES_REQUEST_STATUS = {
  "capability-undeclared": 422,
  "field-not-askable": 422,
} as const;

export const ADDRESS_STATUS = {
  "unknown-route": 404,
  "method-not-allowed": 405,
} as const;

export const AUTH_STATUS = {
  unauthenticated: 401,
  /** Authenticated, and by something that is not a session to end. */
  "not-a-session": 422,
  /** Authenticated, and by something not trusted to do this. */
  "session-required": 403,
  "too-many-attempts": 429,
} as const;

/** Split by concern so a route can document only the codes it can answer with. */
const DAEMON_STATUS = {
  ...BODY_STATUS,
  ...PARAMETER_STATUS,
  ...UPLOAD_STATUS,
  ...SUBJECT_STATUS,
  ...CANDIDATES_REQUEST_STATUS,
  ...ADDRESS_STATUS,
  ...AUTH_STATUS,
} as const satisfies Record<DaemonRefusal["kind"], number>;

export function captureStatus(refusal: CaptureRefusal): number {
  return CAPTURE_STATUS[refusal.kind];
}

export function assetStatus(refusal: AssetRefusal): number {
  return ASSET_STATUS[refusal.kind];
}

export function assetStoreStatus(refusal: AssetStoreRefusal): number {
  return ASSET_STORE_STATUS[refusal.kind];
}

export function archiveStatus(refusal: ArchiveRefusal): number {
  return ARCHIVE_STATUS[refusal.kind];
}

export function tagStatus(refusal: TagRefusal): number {
  return TAG_STATUS[refusal.kind];
}

export function editStatus(refusal: EditRefusal): number {
  return EDIT_STATUS[refusal.kind];
}

export function routingStatus(refusal: RoutingRefusal): number {
  return ROUTING_STATUS[refusal.kind];
}

export function deliveryStatus(refusal: DeliveryRefusal): number {
  return DELIVERY_STATUS[refusal.kind];
}

export function cancelStatus(refusal: CancelRefusal): number {
  return CANCEL_STATUS[refusal.kind];
}

export function destinationStatus(refusal: DestinationRefusal): number {
  return DESTINATION_STATUS[refusal.kind];
}

export function retireStatus(refusal: RetireRefusal): number {
  return RETIRE_STATUS[refusal.kind];
}

export function destinationDeletionStatus(
  refusal: DestinationDeletionRefusal,
): number {
  return DESTINATION_DELETION_STATUS[refusal.kind];
}

export function templateStatus(refusal: RoutingTemplateRefusal): number {
  return TEMPLATE_STATUS[refusal.kind];
}

export function templateRoutingStatus(refusal: TemplateRoutingRefusal): number {
  return TEMPLATE_ROUTING_STATUS[refusal.kind];
}

export function daemonStatus(refusal: DaemonRefusal): number {
  return DAEMON_STATUS[refusal.kind];
}

export function errorBody(
  refusal:
    | ArchiveRefusal
    | AssetRefusal
    | AssetStoreRefusal
    | CancelRefusal
    | CaptureRefusal
    | DaemonRefusal
    | DeliveryRefusal
    | DestinationDeletionRefusal
    | DestinationRefusal
    | EditRefusal
    | OutputRefusal
    | RetireRefusal
    | RoutingRefusal
    | RoutingTemplateRefusal
    | TagRefusal
    | TemplateRoutingRefusal,
): ErrorBody {
  const { kind, ...facts } = refusal;
  return { error: { code: kind, ...facts } };
}

/** The codes a route answers with at one status, read off the mapping itself. */
export function codesFor(
  status: number,
  ...maps: readonly StatusMap[]
): [string, ...string[]] {
  const codes = maps
    .flatMap((map) => Object.entries(map))
    .filter(([, mapped]) => mapped === status)
    .map(([code]) => code);

  const [first, ...rest] = codes;
  if (first === undefined) {
    throw new Error(`no refusal maps to ${status}`);
  }
  return [first, ...rest];
}
