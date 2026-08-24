import type { Context } from "hono";

import type { ItemId, Pool } from "@notemap/core";

import { editStatus, errorBody } from "../errors/refusals";
import { toEditEnvelope } from "../schemas/envelope";
import { editEnvelopeSchema } from "../schemas/item";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

export function editHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, editEnvelopeSchema);
    if (!body.ok) return refuse(body.refusal);

    const id = context.req.param("id") ?? "";

    const result = await pool.items.edit(
      id as ItemId,
      toEditEnvelope(body.value),
      { kind: "person" },
    );

    return result.kind === "refused"
      ? json(errorBody(result.refusal), editStatus(result.refusal))
      : json(result.value, 200);
  };
}
