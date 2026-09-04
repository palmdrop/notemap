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

/**
 * Slower than the mirror's, and with a longer lease. A delivery that could not
 * be carried out inline is waiting on something outside this machine, so
 * hammering it every second buys nothing — and the lease has to outlast a
 * destination that is merely slow, because a lease that expires mid-delivery
 * is abandoned rather than retried.
 */
export const DEFAULT_DELIVERY = {
  pollMs: 5_000,
  leaseMs: 300_000,
  batch: 4,
};

/** How much of a lease is kept back for reporting the outcome the attempt produced. */
export const DELIVERY_REPORT_MARGIN_MS = 5_000;

/**
 * How much of a preview is read into the answer. A preview is drawn for a
 * person to read, so a converter that produced a hundred megabytes of it is
 * answering a question nobody asked — and the answer is JSON, held whole in
 * memory on the way out. What is cut short says so.
 */
export const MAX_PREVIEW_BYTES = 1024 * 1024;
