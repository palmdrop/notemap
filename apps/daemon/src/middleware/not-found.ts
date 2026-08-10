import type { Hono } from "hono";
import type { NotFoundHandler } from "hono";

import { refuse } from "../utils/responses";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read off what is registered, so it cannot drift from the routes themselves. */
export function methodsFor(app: Hono, path: string): string[] {
  const allowed = new Set<string>();

  for (const route of app.routes) {
    if (route.method === "ALL" || route.path.includes("*")) continue;
    const pattern = new RegExp(
      `^${escapeRegExp(route.path).replace(/:[^/]+/g, "[^/]+")}\\/?$`,
    );
    if (pattern.test(path)) allowed.add(route.method.toUpperCase());
  }

  if (allowed.size > 0) allowed.add("OPTIONS");
  return [...allowed].sort();
}

export function notFound(app: Hono): NotFoundHandler {
  return (context) => {
    const path = new URL(context.req.url).pathname;
    const allow = methodsFor(app, path);
    const method = context.req.method;

    // A method already in `allow` reaching here means no route matched at all,
    // whatever the path looked like.
    if (allow.length === 0 || allow.includes(method)) {
      return refuse({ kind: "unknown-route", path });
    }

    return refuse(
      { kind: "method-not-allowed", method, allow },
      { allow: allow.join(", ") },
    );
  };
}
