import type { MiddlewareHandler } from "hono";

import { JSON_MEDIA_TYPE } from "../constants";
import { assetUploadRoute, ROUTES } from "../routes/definitions";
import { refuse } from "../utils/responses";

const CARRY_BODIES = new Set(["POST", "PUT", "PATCH"]);

type Declared = {
  readonly method: string;
  readonly path: string;
  readonly request?: { readonly body?: { readonly required?: boolean } };
};

/**
 * The one route whose body is bytes rather than JSON. Method and path pattern
 * both, so a route added beside it — another method on the same path, or
 * anything under it — does not quietly lose the guard.
 */
const RAW_BODIES: readonly Declared[] = [assetUploadRoute as Declared];

/**
 * Read off the definitions rather than listed here, so the routes a client may
 * send nothing to are the ones the document says they are.
 */
const OPTIONAL_BODIES: readonly Declared[] = (
  ROUTES as readonly Declared[]
).filter((route) => route.request?.body?.required === false);

/** Routes that declare no body at all — `POST .../retire` is the whole request. */
const NO_BODIES: readonly Declared[] = (ROUTES as readonly Declared[]).filter(
  (route) => route.request?.body === undefined,
);

/**
 * Method as well as path: one path carries several routes, and the bodyless
 * `GET /v1/destinations` would otherwise excuse the `POST` beside it.
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

function bodyIsOptional(method: string, path: string): boolean {
  return OPTIONAL_BODIES.some((declared) => matches(declared, method, path));
}

function takesNoBody(method: string, path: string): boolean {
  return NO_BODIES.some((declared) => matches(declared, method, path));
}

/**
 * Framing, not content: under the node server a bodyless request still carries
 * a readable stream, so the headers are what say whether anything is coming.
 */
function carriesBody(request: Request): boolean {
  if (request.headers.get("transfer-encoding") !== null) return true;

  const length = request.headers.get("content-length");
  return length === null ? request.body !== null : length !== "0";
}

export const requireJsonBody: MiddlewareHandler = async (context, next) => {
  if (!CARRY_BODIES.has(context.req.method)) return next();

  const method = context.req.method;
  const path = new URL(context.req.url).pathname;
  if (carriesRawBody(method, path)) return next();
  if (takesNoBody(method, path)) return next();
  if (bodyIsOptional(method, path) && !carriesBody(context.req.raw)) {
    return next();
  }

  const contentType = context.req.header("content-type") ?? "";
  if (contentType.split(";")[0]?.trim().toLowerCase() !== JSON_MEDIA_TYPE) {
    return refuse({ kind: "unsupported-media-type", contentType });
  }

  return next();
};
