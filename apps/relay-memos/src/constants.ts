export const DEFAULT_POOL_URL = "http://127.0.0.1:4747";
export const DEFAULT_SOURCE = "memos";
export const DEFAULT_POLL_MS = 300_000;

/** Memos caps a page at 1000; this is small enough to be one round trip. */
export const PAGE_SIZE = 100;

/**
 * This program, as a UUID. Every asset id a relay-memos derives is a UUIDv5
 * under a namespace derived in turn from this and the source id, so two Memos
 * servers relayed into one pool never derive one id for two attachments.
 */
export const RELAY_MEMOS = "d9232936-e488-4cbe-bceb-a7e106c46725";
