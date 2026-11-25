import type { Context } from "hono";

import type { Pool, Timestamp } from "@notemap/core";

import { json, refuse } from "../utils/responses";

export function countsHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const since = context.req.query("since");
    if (since === undefined) return json(await pool.views.counts(), 200);

    const at = Date.parse(since);
    if (Number.isNaN(at)) return refuse({ kind: "bad-since", since });
    return json(
      await pool.views.counts(new Date(at).toISOString() as Timestamp),
      200,
    );
  };
}
