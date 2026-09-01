/** The shape both a session and an access token present themselves in. */
/** In neither base64url nor the id alphabet, so it cannot occur inside a part. */
export const TOKEN_PART_SEPARATOR = ".";
export const TOKEN_PREFIX = "nmp";

export const DEFAULT_CREDENTIALS_NAME = "admin";

/**
 * How often expired sessions and tokens are swept. Coarse because nothing
 * depends on it: an expired row is refused on sight, so this only stops the
 * table growing for as long as the daemon runs.
 */
export const FORGET_EXPIRED_EVERY_MS = 6 * 60 * 60 * 1000;
