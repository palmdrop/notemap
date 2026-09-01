/**
 * How stale a token's last use may get before verifying it writes a fresh one.
 * Coarse on purpose: the field answers "is this still in use, can I revoke it",
 * which no one reads to the minute, and the interval is what keeps a read path
 * from writing on every request.
 */
export const TOUCH_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours
