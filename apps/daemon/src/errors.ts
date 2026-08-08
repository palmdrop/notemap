import type { CaptureRefusal, SchemaIssue } from "@notemap/core";

/**
 * Every error this API answers with, whoever raised it. `code` is the refusal's
 * `kind` unchanged and the rest of its facts sit beside it; there is no
 * `message`, because a refusal carries facts and rendering them is the
 * client's.
 */
export type ErrorBody = {
  readonly error: { readonly code: string } & Record<string, unknown>;
};

export type DaemonRefusal =
  | { readonly kind: "malformed-json" }
  | {
      readonly kind: "malformed-envelope";
      readonly issues: readonly SchemaIssue[];
    }
  | { readonly kind: "unknown-route"; readonly path: string }
  | { readonly kind: "no-such-item"; readonly item: string }
  | {
      readonly kind: "method-not-allowed";
      readonly method: string;
      readonly allow: readonly string[];
    }
  | { readonly kind: "unsupported-media-type"; readonly contentType: string }
  | {
      readonly kind: "limit-too-large";
      readonly limit: number;
      readonly max: number;
    }
  | { readonly kind: "bad-limit"; readonly limit: string }
  | {
      readonly kind: "bad-order";
      readonly order: string;
      readonly allowed: readonly string[];
    }
  | { readonly kind: "bad-position"; readonly after: string };

/**
 * Total by construction: a refusal kind added to core without a status here
 * fails to compile, which is what makes the mapping mechanical rather than
 * remembered.
 *
 * `409` is a conflict with something the pool already holds — the request was
 * well formed and the client has something to reconcile. `422` is everything
 * else core declined.
 */
const CAPTURE_STATUS = {
  "capture-id-conflict": 409,
  "source-item-changed": 409,
  "unknown-payload-type": 422,
  "payload-invalid": 422,
  "missing-asset-slot": 422,
  "unknown-asset": 422,
  "asset-hash-mismatch": 422,
} as const satisfies Record<CaptureRefusal["kind"], number>;

/** `400` is a body that could not be read as an envelope, and never reached core. */
const DAEMON_STATUS = {
  "malformed-json": 400,
  "malformed-envelope": 400,
  "unknown-route": 404,
  "no-such-item": 404,
  "method-not-allowed": 405,
  "unsupported-media-type": 415,
  "limit-too-large": 422,
  "bad-limit": 422,
  "bad-order": 422,
  "bad-position": 422,
} as const satisfies Record<DaemonRefusal["kind"], number>;

export function captureStatus(
  refusal: CaptureRefusal,
): (typeof CAPTURE_STATUS)[CaptureRefusal["kind"]] {
  return CAPTURE_STATUS[refusal.kind];
}

export function daemonStatus(
  refusal: DaemonRefusal,
): (typeof DAEMON_STATUS)[DaemonRefusal["kind"]] {
  return DAEMON_STATUS[refusal.kind];
}

/** The refusal, spread: its kind becomes `code` and its facts stay as they are. */
export function errorBody(refusal: CaptureRefusal | DaemonRefusal): ErrorBody {
  const { kind, ...facts } = refusal;
  return { error: { code: kind, ...facts } };
}
