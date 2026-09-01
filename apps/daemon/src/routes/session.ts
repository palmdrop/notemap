import type { Context } from "hono";

import type { CookieOptions } from "../auth/sessions/config";
import { clearSessionCookie, setSessionCookie } from "../auth/sessions/cookie";
import type { Auth, MintedSession } from "../auth/types";
import type { AppEnv } from "../types";
import { loginRequestSchema } from "../schemas/session";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";
import type { Throttle } from "../auth/throttle";

export function loginHandler(
  auth: Auth,
  cookies: CookieOptions,
  throttle: Throttle,
) {
  return async (context: Context<AppEnv>): Promise<Response> => {
    // Before the throttle, so that a body nobody could read is not a guess.
    const body = await readBody(context, loginRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const attempt = throttle.begin();
    if (!attempt.allowed) {
      const seconds = Math.ceil(attempt.wait / 1000);
      return refuse(
        { kind: "too-many-attempts", retryAfter: seconds },
        { "retry-after": String(seconds) },
      );
    }

    let minted: MintedSession | undefined;
    try {
      minted = await auth.login(body.value.name, body.value.password);
    } finally {
      attempt.settle(minted !== undefined);
    }

    if (minted === undefined) return refuse({ kind: "unauthenticated" });

    setSessionCookie(context, minted, cookies);

    // Hono's own builder, not the `json` helper: `setSessionCookie` stages the
    // header on the context, and a freshly constructed Response would drop it.
    return context.json(
      {
        authenticated: true,
        requiresCredentials: true,
        identity: { kind: "session", id: minted.id },
      },
      200,
    );
  };
}

export function sessionHandler(auth: Auth) {
  return async (context: Context<AppEnv>): Promise<Response> => {
    // Set by `identify`, which lets this route through either way.
    const identity = context.get("identity");

    return json(
      {
        authenticated: identity !== undefined,
        requiresCredentials: await auth.requiresCredentials(),
        ...(identity === undefined ? {} : { identity }),
      },
      200,
    );
  };
}

export function logoutHandler(auth: Auth, cookies: CookieOptions) {
  return async (context: Context<AppEnv>): Promise<Response> => {
    const identity = context.get("identity");

    // An access token is not a session, and silently answering 204 would claim
    // to have ended something.
    if (identity?.kind === "token") {
      return refuse({ kind: "not-a-session", presented: "token" });
    }

    if (identity !== undefined) await auth.endSession(identity.id);

    clearSessionCookie(context, cookies);

    return context.body(null, 204);
  };
}

export function endAllSessionsHandler(auth: Auth, cookies: CookieOptions) {
  return async (context: Context<AppEnv>): Promise<Response> => {
    await auth.endAllSessions();

    clearSessionCookie(context, cookies);

    return context.body(null, 204);
  };
}
