export const AUTH_SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 10; // 10 days

export type CookieOptions = {
  /**
   * Loopback is a trustworthy origin to a browser, so this stays on there and
   * is off only where an origin says `http:` out loud.
   */
  readonly secure: boolean;
};
