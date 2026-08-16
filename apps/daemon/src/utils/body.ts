import type { Context } from "hono";
import type { z } from "zod";

import { toSchemaIssues } from "../errors/envelope-issues";
import type { DaemonRefusal } from "../types";

export type ReadBody<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: DaemonRefusal };

/**
 * An empty body is read as `{}` rather than refused. Capture does not use this:
 * its body is mandatory, and an empty one is malformed rather than absent.
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
