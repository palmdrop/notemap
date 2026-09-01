import type { MiddlewareHandler } from "hono";

import { reachedElsewhere } from "../config/load";
import type { AppEnv } from "../types";

const advice = (arrivedFor: string, origin: string | undefined): string =>
  origin === undefined
    ? `notemap: a sign-in arrived for ${arrivedFor}, but daemon.origin is unset, so the session cookie is minted for a browser on loopback and carries Secure — set daemon.origin to the URL a browser reaches this daemon at, or the cookie is dropped and every request after signing in is refused`
    : `notemap: a sign-in arrived for ${arrivedFor}, but daemon.origin says ${origin}, and the session cookie is minted for that one`;

/**
 * Says the one thing the daemon cannot work out for itself. Where it is bound
 * is not where a browser reaches it: a tunnel or a proxy puts a name in front
 * of a daemon on loopback, and the cookie decided from the wrong one is dropped
 * by the browser with nothing said on either side of the wire.
 *
 * Once per daemon, and never a refusal — the mismatch is a guess about somebody
 * else's network, and a wrong guess must not be the thing that shuts the door.
 */
export const noticeOrigin = (
  origin: string | undefined,
): MiddlewareHandler<AppEnv> => {
  let said = false;

  return async (context, next) => {
    const arrivedFor = context.req.header("host");

    if (!said && reachedElsewhere(arrivedFor, origin)) {
      said = true;
      console.warn(advice(arrivedFor as string, origin));
    }

    return next();
  };
};
