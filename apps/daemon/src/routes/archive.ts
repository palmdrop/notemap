import type { Context } from "hono";

import type { ItemId, Pool } from "@notemap/core";

import { archiveStatus, errorBody } from "../errors/refusals";
import {
  archiveRequestSchema,
  unarchiveRequestSchema,
} from "../schemas/archive";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

export function archiveHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, archiveRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const id = context.req.param("id") ?? "";
    const result = await pool.items.archive(id as ItemId, body.value.reason);

    return result.kind === "refused"
      ? json(errorBody(result.refusal), archiveStatus(result.refusal))
      : json(result.value, 200);
  };
}

export function unarchiveHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, unarchiveRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const id = context.req.param("id") ?? "";
    const result = await pool.items.unarchive(id as ItemId);

    return result.kind === "refused"
      ? json(errorBody(result.refusal), archiveStatus(result.refusal))
      : json(result.value, 200);
  };
}
