export const UNFURL_SCHEMES: readonly string[] = ["http:", "https:"];

export const MAX_REDIRECTS = 5;

/** For the whole chain, redirects and name lookups included. */
export const UNFURL_TIMEOUT_MS = 5_000;

/**
 * Reading stops where the head ends; this is for a page whose head never does.
 * Counted after decompression.
 */
export const MAX_UNFURL_BYTES = 512 * 1024;

/** Where a page may declare its charset, if its response did not. */
export const CHARSET_SNIFF_BYTES = 1024;

export const UNFURL_LIFETIME_MS = 60 * 60 * 1000;

/** Short, so a target that was briefly down is not unreadable for the hour. */
export const FAILED_UNFURL_LIFETIME_MS = 5 * 60 * 1000;

export const MAX_UNFURLS_HELD = 500;

export const MAX_TITLE_LENGTH = 300;
export const MAX_DESCRIPTION_LENGTH = 600;

/** Longer is dropped rather than cut: half an address fetches something else. */
export const MAX_IMAGE_URL_LENGTH = 2048;

export const USER_AGENT =
  "notemap-unfurl (+https://github.com/palmdrop/notemap)";
