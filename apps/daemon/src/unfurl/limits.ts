export const UNFURL_SCHEMES: readonly string[] = ["http:", "https:"];

export const MAX_REDIRECTS = 5;

/** For the whole chain, redirects and name lookups included. */
export const UNFURL_TIMEOUT_MS = 5_000;

/** The head is all that is wanted, and it is nearly always well inside this. */
export const MAX_UNFURL_BYTES = 512 * 1024;

export const UNFURL_LIFETIME_MS = 60 * 60 * 1000;

/** Short, so a target that was briefly down is not unreadable for the hour. */
export const FAILED_UNFURL_LIFETIME_MS = 5 * 60 * 1000;

export const MAX_UNFURLS_HELD = 500;

export const MAX_TITLE_LENGTH = 300;
export const MAX_DESCRIPTION_LENGTH = 600;

export const USER_AGENT =
  "notemap-unfurl (+https://github.com/palmdrop/notemap)";
