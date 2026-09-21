import type { MiddlewareHandler } from "hono";

import { JSON_MEDIA_TYPE } from "../constants";
import type { Logger } from "../log";
import type { AppEnv, ErrorBody } from "../types";

/**
 * One line per request, once it has been answered. Debug rather than info: the
 * shell polls and the container's healthcheck asks, and at info the log would
 * be mostly that. A 500 is logged where it is caught, with its stack.
 */
export const logRequests = (log: Logger): MiddlewareHandler<AppEnv> => {
  return async (context, next) => {
    const started = performance.now();
    await next();

    const { status } = context.res;
    const identity = context.get("identity");

    log.debug(
      {
        method: context.req.method,
        path: context.req.path,
        status,
        ms: Math.round(performance.now() - started),
        by: identity?.kind ?? "nobody",
        ...(await refusalCode(context.res)),
      },
      "request",
    );
  };
};

/** What a refusal was refused as, read off a copy of the body. */
async function refusalCode(response: Response): Promise<{ code?: string }> {
  if (response.status < 400 || response.status >= 500) return {};
  if (!response.headers.get("content-type")?.startsWith(JSON_MEDIA_TYPE)) {
    return {};
  }

  try {
    const body = (await response.clone().json()) as Partial<ErrorBody>;
    const code = body.error?.code;
    return typeof code === "string" ? { code } : {};
  } catch {
    return {};
  }
}
