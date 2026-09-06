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

/**
 * Where a capture carrying no offset of its own is read from. The host's own
 * zone rather than UTC: a capture from a source belongs to the day the person
 * running the pool is living in, and `Intl` is where this machine says which
 * that is.
 */
export function defaultZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

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

/**
 * How long a template fired by its trigger tag waits before its delivery is
 * claimable. Nothing is attempted inline on that path, so this window is the
 * whole of what the corner's cancel has to act in — comfortably more than the
 * delivery runner's own poll, so the wait is the window rather than the poll.
 */
export const DEFAULT_TRIGGER_WINDOW_MS = 15_000;

/**
 * How much of a lease is kept back for reporting the outcome the attempt
 * produced — which includes **storing the output** it came back with, so this
 * is bounded by whatever a destination decided to hand over rather than by the
 * report alone. Overrunning it abandons a delivery that landed. Both kinds that
 * produce one today hand over a string held in memory.
 */
export const DELIVERY_REPORT_MARGIN_MS = 5_000;

/** How much of a preview is inlined. The answer is JSON, held whole in memory on the way out. */
export const MAX_PREVIEW_BYTES = 1024 * 1024;
