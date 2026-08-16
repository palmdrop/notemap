import { extname, join, resolve, sep } from "node:path";

import type { NotFoundHandler } from "hono";

import { PUBLIC_DIR } from "../paths";
import { readCachedBytes } from "../utils/static-file";

export const UI_DIR = join(PUBLIC_DIR, "ui");

const SHELL = join(UI_DIR, "index.html");

/** Everything the build emits. An unlisted extension downloads rather than renders. */
const TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

/** The build hashes what it puts here, so a stale copy cannot be served under its name. */
const IMMUTABLE = `${sep}_app${sep}immutable${sep}`;

/** A path parameter is not a file path: resolve it, then prove it stayed inside. */
function fileFor(path: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return undefined;
  }

  const candidate = resolve(UI_DIR, `.${decoded}`);
  return candidate === UI_DIR || candidate.startsWith(`${UI_DIR}${sep}`)
    ? candidate
    : undefined;
}

function served(body: Uint8Array, type: string, immutable = false): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": immutable
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    },
  });
}

/**
 * The app is a static build with client-side routing: its own paths exist only
 * in the browser, so an unmatched one has to answer the shell for the app to
 * route it. Wrapping the not-found handler rather than registering `GET *`
 * keeps that last, after every route the daemon actually answers.
 */
export function serveUi(fallthrough: NotFoundHandler): NotFoundHandler {
  return (context) => {
    const path = new URL(context.req.url).pathname;

    if (
      context.req.method !== "GET" ||
      path === "/v1" ||
      path.startsWith("/v1/")
    ) {
      return fallthrough(context);
    }

    const found = fileFor(path);
    if (found !== undefined) {
      const body = readCachedBytes(found);
      if (body !== undefined) {
        return served(
          body,
          TYPES[extname(found)] ?? "application/octet-stream",
          found.includes(IMMUTABLE),
        );
      }
    }

    // Answering the shell here would hand a browser HTML where its own markup
    // told it to expect a script, a stylesheet or an image.
    if (extname(path) !== "") return fallthrough(context);

    const shell = readCachedBytes(SHELL);
    return shell === undefined
      ? fallthrough(context)
      : served(shell, TYPES[".html"]);
  };
}
