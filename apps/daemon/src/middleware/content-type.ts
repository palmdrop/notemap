import type { MiddlewareHandler } from "hono";

import { JSON_MEDIA_TYPE } from "../constants";
import { assetUploadRoute } from "../routes/definitions";
import { refuse } from "../utils/responses";

const CARRY_BODIES = new Set(["POST", "PUT", "PATCH"]);

type Declared = {
  readonly method: string;
  readonly path: string;
};

/**
 * The one route whose body is bytes rather than JSON. Method and path pattern
 * both, so a route added beside it — another method on the same path, or
 * anything under it — does not quietly lose the guard.
 */
const RAW_BODIES: readonly Declared[] = [assetUploadRoute as Declared];

/**
 * Method as well as path: one path carries several routes, and the bodyless
 * `GET /v1/assets/{id}` would otherwise excuse the `PUT` beside it.
 */
function matches(declared: Declared, method: string, path: string): boolean {
  if (declared.method.toUpperCase() !== method) return false;

  const pattern = declared.path.split("/");
  const actual = path.split("/");

  return (
    pattern.length === actual.length &&
    pattern.every((segment, index) =>
      segment.startsWith("{")
        ? actual[index] !== ""
        : segment === actual[index],
    )
  );
}

function carriesRawBody(method: string, path: string): boolean {
  return RAW_BODIES.some((declared) => matches(declared, method, path));
}

/**
 * Declared whether or not anything is carried. A route reading no body has no
 * media type to be wrong about, but a request that declares none is a request
 * an HTML form can send — and a form crossing origins is not preflighted, so
 * the media type is what makes the browser ask the daemon first.
 */
export const requireJsonBody: MiddlewareHandler = async (context, next) => {
  const method = context.req.method;
  if (!CARRY_BODIES.has(method)) return next();

  const path = new URL(context.req.url).pathname;
  if (carriesRawBody(method, path)) return next();

  const contentType = context.req.header("content-type") ?? "";
  if (contentType.split(";")[0]?.trim().toLowerCase() !== JSON_MEDIA_TYPE) {
    return refuse({ kind: "unsupported-media-type", contentType });
  }

  return next();
};
