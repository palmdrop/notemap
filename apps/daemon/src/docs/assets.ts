import { join } from "node:path";

import type { Context } from "hono";

import { PUBLIC_DIR } from "../paths";
import { refuse } from "../utils/responses";
import { readCached } from "../utils/static-file";

/** Named rather than joined from the request: a path parameter is not a file path. */
const ASSETS: Record<string, string> = {
  "swagger-ui-bundle.js": "text/javascript; charset=utf-8",
  "swagger-ui.css": "text/css; charset=utf-8",
};

export function docsFileHandler(context: Context): Response {
  const name = context.req.param("file") ?? "";
  const type = ASSETS[name];
  const source =
    type === undefined
      ? undefined
      : readCached(join(PUBLIC_DIR, "vendor/swagger", name));

  if (type === undefined || source === undefined) {
    return refuse({
      kind: "unknown-route",
      path: new URL(context.req.url).pathname,
    });
  }

  return new Response(source, {
    status: 200,
    headers: { "content-type": type, "cache-control": "no-cache" },
  });
}
