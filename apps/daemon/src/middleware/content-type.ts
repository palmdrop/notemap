import type { MiddlewareHandler } from "hono";

import { JSON_MEDIA_TYPE } from "../constants";
import { assetUploadRoute, ROUTES } from "../routes/definitions";
import { refuse } from "../utils/responses";

const CARRY_BODIES = new Set(["POST", "PUT", "PATCH"]);

/**
 * The one path whose body is bytes rather than JSON. By exact path rather than
 * by prefix, so no route added under it quietly loses the guard.
 */
const RAW_BODIES = new Set<string>([assetUploadRoute.path]);

type Declared = {
  readonly path: string;
  readonly request?: { readonly body?: { readonly required?: boolean } };
};

/**
 * Read off the definitions rather than listed here, so the routes a client may
 * send nothing to are the ones the document says they are.
 */
const OPTIONAL_BODIES: readonly string[] = (ROUTES as readonly Declared[])
  .filter((route) => route.request?.body?.required === false)
  .map((route) => route.path);

/**
 * Routes that declare no body at all — `POST .../retire` is the whole request.
 * Nothing here reads one, so there is no media type to be wrong about, and a
 * client that framed its empty request differently is not making a mistake.
 */
const NO_BODIES: readonly string[] = (ROUTES as readonly Declared[])
  .filter((route) => route.request?.body === undefined)
  .map((route) => route.path);

/** `{id}` stands for one non-empty segment, as it does to the router. */
function matches(declared: string, path: string): boolean {
  const pattern = declared.split("/");
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

function bodyIsOptional(path: string): boolean {
  return OPTIONAL_BODIES.some((declared) => matches(declared, path));
}

function takesNoBody(path: string): boolean {
  return NO_BODIES.some((declared) => matches(declared, path));
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

  const path = new URL(context.req.url).pathname;
  if (RAW_BODIES.has(path)) return next();
  if (takesNoBody(path)) return next();
  if (bodyIsOptional(path) && !carriesBody(context.req.raw)) return next();

  const contentType = context.req.header("content-type") ?? "";
  if (contentType.split(";")[0]?.trim().toLowerCase() !== JSON_MEDIA_TYPE) {
    return refuse({ kind: "unsupported-media-type", contentType });
  }

  return next();
};
