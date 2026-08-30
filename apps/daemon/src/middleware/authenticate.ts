import type { Context, MiddlewareHandler } from "hono";

import type { CookieOptions } from "../auth/sessions/config";
import { clearSessionCookie, readSessionCookie } from "../auth/sessions/cookie";
import type { Auth } from "../auth/types";
import type { AppEnv } from "../types";
import { refuse } from "../utils/responses";

/**
 * `refuse` builds its own Response, which would drop a cookie staged on the
 * context — so a refusal has to carry the deletion across itself.
 */
const carryingCookies = (context: Context<AppEnv>, response: Response) => {
  const staged = context.res.headers.get("set-cookie");

  if (staged !== null) response.headers.append("set-cookie", staged);

  return response;
};

/**
 * Works out who a request is and records it. `required` decides only what
 * happens when nothing valid was presented: a refusal on the routes behind the
 * door, and no identity at all on the ones where being signed out is an answer
 * rather than a rejection.
 */
const resolveIdentity =
  (auth: Auth, cookieOptions: CookieOptions, required: boolean): MiddlewareHandler<AppEnv> =>
  async (context, next) => {
    if (!(await auth.requiresCredentials())) return next();

    const authorizationHeader = context.req.header("authorization");
    const bearer = authorizationHeader?.startsWith("Bearer ")
      ? authorizationHeader.slice("Bearer ".length).trim()
      : undefined;

    const cookie = readSessionCookie(context, cookieOptions);

    const hasBearer = bearer !== undefined && bearer.length > 0;
    const hasCookie = cookie !== undefined && cookie.length > 0;

    if (!hasBearer && !hasCookie) {
      return required ? refuse({ kind: "unauthenticated" }) : next();
    }

    const identity = await auth.authenticate(
      hasBearer ? "token" : "session",
      hasBearer ? bearer! : cookie!,
    );

    if (identity === undefined) {
      // A cookie that failed will never pass, so the browser should stop
      // sending it. A bearer token is the caller's own to fix, and a bad one
      // must not take a good session with it.
      if (!hasBearer) clearSessionCookie(context, cookieOptions);

      return required
        ? carryingCookies(context, refuse({ kind: "unauthenticated" }))
        : next();
    }

    context.set("identity", identity);
    return next();
  };

/**
 * Keeps a credential from widening itself: a leaked access token could
 * otherwise mint a replacement that outlives revoking the original. Signing in
 * is the only way to reach the routes that manage tokens.
 *
 * Runs after the door, so an absent identity here means the daemon asks for
 * nothing at all and everything is open.
 */
export const requireSession: MiddlewareHandler<AppEnv> = async (
  context,
  next,
) => {
  const identity = context.get("identity");

  return identity !== undefined && identity.kind !== "session"
    ? refuse({ kind: "session-required" })
    : next();
};

/** The door. Nothing reaches the pool without an identity. */
export const authenticate = (auth: Auth, cookieOptions: CookieOptions) =>
  resolveIdentity(auth, cookieOptions, true);

/**
 * Records an identity where one was presented and lets everything through, for
 * the routes that answer *whether* a request is signed in.
 */
export const identify = (auth: Auth, cookieOptions: CookieOptions) =>
  resolveIdentity(auth, cookieOptions, false);
