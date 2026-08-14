import type { Context } from "hono";
import type { z } from "zod";

import { toSchemaIssues } from "../errors/envelope-issues";
import type { DaemonRefusal } from "../types";

export type ReadBody<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: DaemonRefusal };

/**
 * A JSON body a route may be sent nothing of. An empty body is read as `{}`
 * rather than refused: a decision with nothing to add carries no fields, and
 * making the client send `{}` would be ceremony over a route that takes a path
 * and an id.
 */
export async function readBody<T>(
  context: Context,
  schema: z.ZodType<T>,
): Promise<ReadBody<T>> {
  const raw = await context.req.text();

  let body: unknown = {};
  if (raw.trim() !== "") {
    try {
      body = JSON.parse(raw);
    } catch {
      return { ok: false, refusal: { kind: "malformed-json" } };
    }
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      refusal: {
        kind: "malformed-envelope",
        issues: toSchemaIssues(parsed.error.issues, body),
      },
    };
  }

  return { ok: true, value: parsed.data };
}
