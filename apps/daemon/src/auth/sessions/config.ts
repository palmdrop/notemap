export const AUTH_SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 10; // 10 days

export type CookieOptions = {
  /**
   * Loopback is a trustworthy origin to a browser, so this stays on there and
   * is off only where an origin says `http:` out loud.
   */
  readonly secure: boolean;
  /**
   * Whether the cookie carries the `__Host-` prefix. Not the same question as
   * `secure`: Chromium honours the prefix only over `https:` and drops the
   * cookie whole rather than ignoring the name, which signs nobody in on a
   * loopback daemon.
   */
  readonly prefixed: boolean;
};
