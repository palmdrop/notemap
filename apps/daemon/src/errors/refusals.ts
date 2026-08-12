import type { AssetRefusal, CaptureRefusal } from "@notemap/core";

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
  "digest-mismatch": 422,
  "asset-too-large": 413,
} as const;

/** Reading an asset. Both are `404`, distinguished by code: a read never rehashes, so drift cannot arise. */
export const ASSET_STATUS = {
  "no-such-asset": 404,
  "blob-missing": 404,
} as const satisfies Record<AssetRefusal["kind"], number>;

/** Anything wrong with a query parameter. */
export const PARAMETER_STATUS = {
  "limit-too-large": 422,
  "bad-limit": 422,
  "bad-order": 422,
  "bad-position": 422,
} as const;

export const SUBJECT_STATUS = { "no-such-item": 404 } as const;

export const ADDRESS_STATUS = {
  "unknown-route": 404,
  "method-not-allowed": 405,
} as const;

/** Split by concern so a route can document only the codes it can answer with. */
const DAEMON_STATUS = {
  ...BODY_STATUS,
  ...PARAMETER_STATUS,
  ...UPLOAD_STATUS,
  ...SUBJECT_STATUS,
  ...ADDRESS_STATUS,
} as const satisfies Record<DaemonRefusal["kind"], number>;

export function captureStatus(refusal: CaptureRefusal): number {
  return CAPTURE_STATUS[refusal.kind];
}

export function assetStatus(refusal: AssetRefusal): number {
  return ASSET_STATUS[refusal.kind];
}

export function daemonStatus(refusal: DaemonRefusal): number {
  return DAEMON_STATUS[refusal.kind];
}

export function errorBody(
  refusal: AssetRefusal | CaptureRefusal | DaemonRefusal,
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
