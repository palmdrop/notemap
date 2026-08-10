import type { Context } from "hono";

import type { Pool } from "@notemap/core";

import { toSchemaIssues } from "../errors/envelope-issues";
import { captureStatus, errorBody } from "../errors/refusals";
import { captureEnvelopeSchema, toEnvelope } from "../schemas/envelope";
import { json, refuse } from "../utils/responses";

export function captureHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
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
  };
}
