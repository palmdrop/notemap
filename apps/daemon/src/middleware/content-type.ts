import type { MiddlewareHandler } from "hono";

import { JSON_MEDIA_TYPE } from "../constants";
import { refuse } from "../utils/responses";

/**
 * Keyed on the method rather than on whether a body is present: under the node
 * server a bodyless request still carries a readable stream, so an `OPTIONS`
 * would be refused for having no content type.
 */
const CARRY_BODIES = new Set(["POST", "PUT", "PATCH"]);

export const requireJsonBody: MiddlewareHandler = async (context, next) => {
  if (!CARRY_BODIES.has(context.req.method)) return next();

  const contentType = context.req.header("content-type") ?? "";
  if (contentType.split(";")[0]?.trim().toLowerCase() !== JSON_MEDIA_TYPE) {
    return refuse({ kind: "unsupported-media-type", contentType });
  }

  return next();
};
