import type { Context } from "hono";

import type { ItemId, Pool } from "@notemap/core";

import { editStatus, errorBody } from "../errors/refusals";
import { editRequestSchema, toPayload } from "../schemas/item";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

export function editHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, editRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const id = context.req.param("id") ?? "";

    const result = await pool.items.edit(id as ItemId, toPayload(body.value));

    return result.kind === "refused"
      ? json(errorBody(result.refusal), editStatus(result.refusal))
      : json(result.value, 200);
  };
}
