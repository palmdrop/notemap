import type { Context } from "hono";

import type { ItemId, Pool } from "@notemap/core";

import { errorBody, routingStatus } from "../errors/refusals";
import { markProcessedRequestSchema } from "../schemas/routing";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

export function markProcessedHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, markProcessedRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const id = context.req.param("id") ?? "";
    const result = await pool.routing.markProcessed(
      id as ItemId,
      body.value.note,
    );

    // 200 rather than 201: a routing record has no URL of its own, so there is
    // no `Location` to name and the body already says everything a 201 would.
    return result.kind === "refused"
      ? json(errorBody(result.refusal), routingStatus(result.refusal))
      : json(result.value, 200);
  };
}

export function routingRecordsHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = context.req.param("id") ?? "";

    // Unlike the action log, this is the item's own state and goes when it
    // does, so an empty list for an unknown id would be a claim about an item.
    if ((await pool.items.get(id as ItemId)) === undefined) {
      return refuse({ kind: "no-such-item", item: id });
    }

    return json({ values: await pool.routing.recordsFor(id as ItemId) }, 200);
  };
}
