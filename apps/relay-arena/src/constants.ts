export const DEFAULT_POOL_URL = "http://127.0.0.1:4747";

/** The service, not a deployment: nothing in config or in a setting can move it. */
export const ARENA_API = "https://api.are.na";

export const DEFAULT_POLL_MS = 900_000;

/** The shortest interval a config may set: are.na asks callers not to poll it hard. */
export const MIN_POLL_MS = 300_000;

/**
 * How often a poll reads every page of every channel rather than stopping at
 * the first page the pool already knows. That full read is what picks up an
 * edit further down a channel, and a block a failed poll left behind.
 */
export const FULL_SCAN_MS = 86_400_000;

/** are.na's contents endpoint accepts up to 100; this is one round trip per page. */
export const PER_PAGE = 100;

/**
 * Requests left in are.na's window that this relay will not spend, so an
 * arena destination sharing the token still has some.
 */
export const RATE_LIMIT_RESERVE = 5;

/** are.na's rate-limit window, and the longest the relay waits on its reset. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** The gap between two requests when are.na answers without rate-limit headers. */
export const UNPACED_GAP_MS = 500;

/**
 * This program, as a UUID. Every asset id a relay-arena derives is a UUIDv5
 * under a namespace derived in turn from this and the source id, so two
 * channels relayed into one pool never derive one id for two attachments.
 */
export const RELAY_ARENA = "42f2bf62-27bc-47e9-8989-f37c25ea6f13";
