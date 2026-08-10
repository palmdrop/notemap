import type { Context } from "hono";

import type { ItemId, Pool } from "@notemap/core";

import { json, refuse } from "../utils/responses";

export function itemHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = context.req.param("id") ?? "";
    const item = await pool.items.get(id as ItemId);

    return item === undefined
      ? refuse({ kind: "no-such-item", item: id })
      : json(item, 200);
  };
}
