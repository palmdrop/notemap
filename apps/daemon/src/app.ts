import { OpenAPIHono, type z } from "@hono/zod-openapi";

import type {
  CaptureEnvelope,
  FeedOrder,
  ItemId,
  Pool,
  Position,
  TagName,
} from "@notemap/core";

import { toSchemaIssues } from "./envelope-issues";
import {
  captureStatus,
  daemonStatus,
  errorBody,
  type DaemonRefusal,
} from "./errors";
import {
  DEFAULT_LIMIT,
  FEED_ORDERS,
  feedUrl,
  MAX_LIMIT,
  parsePosition,
} from "./positions";
import { captureRoute, feedRoute, itemRoute } from "./routes";
import { captureEnvelopeSchema } from "./wire";

const JSON_TYPE = "application/json; charset=utf-8";

export const OPENAPI_INFO = {
  openapi: "3.1.0",
  info: {
    title: "notemap",
    version: "1",
    description:
      "The capture-and-feed subset of notemap's /v1 surface. Binds to localhost; no authentication.",
  },
} as const;

/** Every response body this API sends, including its errors, is JSON. */
function json(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": JSON_TYPE, ...headers },
  });
}

function refuse(refusal: DaemonRefusal, headers: Record<string, string> = {}) {
  return json(errorBody(refusal), daemonStatus(refusal), headers);
}

/**
 * What the wire calls an envelope, as core's type. Written out field by field
 * rather than spread, so a field core adds fails to compile here instead of
 * silently never arriving.
 */
function toEnvelope(
  parsed: z.infer<typeof captureEnvelopeSchema>,
): CaptureEnvelope {
  return {
    ...(parsed.id === undefined ? {} : { id: parsed.id }),
    source: parsed.source,
    sourceItemId: parsed.sourceItemId,
    capturedAt: parsed.capturedAt,
    payload: parsed.payload,
    ...(parsed.tags === undefined
      ? {}
      : { tags: parsed.tags as readonly TagName[] }),
  };
}

type FeedQuery =
  | {
      readonly ok: true;
      readonly order: FeedOrder;
      readonly limit: number;
      readonly after?: Position;
    }
  | { readonly ok: false; readonly refusal: DaemonRefusal };

function readFeedQuery(url: URL): FeedQuery {
  const rawOrder = url.searchParams.get("order");
  const rawLimit = url.searchParams.get("limit");
  const rawAfter = url.searchParams.get("after");

  const order = (rawOrder ?? FEED_ORDERS[0]) as FeedOrder;
  if (!FEED_ORDERS.includes(order)) {
    return {
      ok: false,
      refusal: {
        kind: "bad-order",
        order: rawOrder ?? "",
        allowed: FEED_ORDERS,
      },
    };
  }

  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    // Not `Number()`: it reads "50abc" as NaN but "" and " " as 0, and a limit
    // the client did not write is worse than one refused.
    if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1) {
      return { ok: false, refusal: { kind: "bad-limit", limit: rawLimit } };
    }
    limit = Number(rawLimit);
    if (limit > MAX_LIMIT) {
      return {
        ok: false,
        refusal: { kind: "limit-too-large", limit, max: MAX_LIMIT },
      };
    }
  }

  if (rawAfter === null) return { ok: true, order, limit };

  const after = parsePosition(rawAfter);
  if (after === undefined) {
    return { ok: false, refusal: { kind: "bad-position", after: rawAfter } };
  }

  return { ok: true, order, limit, after };
}

/**
 * Which methods a path answers, read off what is registered rather than from a
 * table beside it — a table would drift the first time a route moved.
 */
function methodsFor(app: OpenAPIHono, path: string): string[] {
  const allowed = new Set<string>();

  for (const route of app.routes) {
    if (route.method === "ALL" || route.path.includes("*")) continue;
    const pattern = new RegExp(
      `^${route.path.replace(/:[^/]+/g, "[^/]+")}\\/?$`,
    );
    if (pattern.test(path)) allowed.add(route.method.toUpperCase());
  }

  if (allowed.size > 0) allowed.add("OPTIONS");
  return [...allowed].sort();
}

export function createApp(pool: Pool): OpenAPIHono {
  const app = new OpenAPIHono();

  /**
   * Documentation and handler are registered separately, rather than through
   * `app.openapi()`, because that helper types a handler against the responses
   * its route declares — and this API answers refusals in one envelope of its
   * own, from one helper, at statuses the framework would rather see enumerated
   * per route. The served document is generated from this same registry, and a
   * test compares it against the copy checked in, so the two cannot drift
   * unnoticed.
   */
  for (const route of [captureRoute, feedRoute, itemRoute]) {
    app.openAPIRegistry.registerPath(route);
  }

  app.use("/v1/*", async (context, next) => {
    if (context.req.raw.body === null) return next();

    const contentType = context.req.header("content-type") ?? "";
    if (!contentType.split(";")[0]?.trim().endsWith("/json")) {
      return refuse({ kind: "unsupported-media-type", contentType });
    }

    return next();
  });

  app.post("/v1/captures", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return refuse({ kind: "malformed-json" });
    }

    const parsed = captureEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      return refuse({
        kind: "malformed-envelope",
        issues: toSchemaIssues(parsed.error.issues, body),
      });
    }

    const result = await pool.capture(toEnvelope(parsed.data));
    if (result.kind === "refused") {
      return json(errorBody(result.refusal), captureStatus(result.refusal));
    }

    const outcome = result.value;
    if (outcome.kind === "already-captured") return json(outcome, 200);

    return json(outcome, 201, {
      location: `/v1/items/${encodeURIComponent(outcome.item.id)}`,
    });
  });

  app.get("/v1/feed", async (context) => {
    const query = readFeedQuery(new URL(context.req.url));
    if (!query.ok) return refuse(query.refusal);

    const slice = await pool.views.feed({
      order: query.order,
      limit: query.limit,
      ...(query.after === undefined ? {} : { after: query.after }),
    });

    return json(
      {
        values: slice.values,
        ...(slice.next === undefined
          ? {}
          : { next: feedUrl(query.order, query.limit, slice.next) }),
      },
      200,
    );
  });

  app.get("/v1/items/:id", async (context) => {
    const id = context.req.param("id");
    const item = await pool.items.get(id as ItemId);

    return item === undefined
      ? refuse({ kind: "no-such-item", item: id })
      : json(item, 200);
  });

  app.doc31("/v1/openapi.json", OPENAPI_INFO);

  app.notFound((context) => {
    const path = new URL(context.req.url).pathname;
    const allow = methodsFor(app, path);

    return allow.length === 0
      ? refuse({ kind: "unknown-route", path })
      : refuse(
          {
            kind: "method-not-allowed",
            method: context.req.method,
            allow,
          },
          { allow: allow.join(", ") },
        );
  });

  /**
   * An unexpected throw is a bug, and gets no domain-shaped body: a client that
   * learns to parse a refusal out of a crash learns to trust a fiction.
   */
  app.onError((error) => {
    console.error(error);
    return new Response(null, { status: 500 });
  });

  return app;
}
