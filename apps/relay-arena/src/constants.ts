export const DEFAULT_POOL_URL = "http://127.0.0.1:4747";

/**
 * Longer than relay-memos' five minutes: are.na asks callers not to enumerate
 * aggressively, and this relay re-reads every watched channel every poll.
 */
export const DEFAULT_POLL_MS = 900_000;

/** are.na's contents endpoint accepts up to 100; this is one round trip per page. */
export const PER_PAGE = 100;

/**
 * This program, as a UUID. Every asset id a relay-arena derives is a UUIDv5
 * under a namespace derived in turn from this and the source id, so two
 * channels relayed into one pool never derive one id for two attachments.
 */
export const RELAY_ARENA = "42f2bf62-27bc-47e9-8989-f37c25ea6f13";
