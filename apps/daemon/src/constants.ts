import type { ReadOrder } from "@notemap/core";

export const JSON_TYPE = "application/json; charset=utf-8";
export const JSON_MEDIA_TYPE = "application/json";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4747;

export const READ_ORDERS: readonly ReadOrder[] = [
  "newest-first",
  "oldest-first",
];

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

export const DEFAULT_RETRY = {
  maxAttempts: 5,
  initialBackoff: 1000,
  maxBackoff: 60_000,
};

/** The grace has to outlast any plausible gap between an upload and its capture. */
export const DEFAULT_SWEEP = {
  graceMs: 86_400_000,
  intervalMs: 3_600_000,
};

/** Generous enough for a phone photo or a long voice memo. */
export const DEFAULT_MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

export const SHUTDOWN_GRACE_MS = 2_000;

/**
 * The runner polls rather than being kicked by the request path. A capture is
 * mirrored within a second of committing, which is well inside what "the pool
 * is no longer the only copy" has to mean, and it needs no signal from a route.
 */
export const DEFAULT_MIRROR = {
  pollMs: 1_000,
  leaseMs: 60_000,
  batch: 16,
};
