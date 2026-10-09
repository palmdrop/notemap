import type { Context } from "hono";

import type { ItemId, Pool } from "@notemap/core";

import { MAX_ITEMS_READ } from "../constants";
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

export function itemsHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const ids = new Set(new URL(context.req.url).searchParams.getAll("id"));
    if (ids.size === 0) return refuse({ kind: "id-required" });
    if (ids.size > MAX_ITEMS_READ) {
      return refuse({
        kind: "limit-too-large",
        limit: ids.size,
        max: MAX_ITEMS_READ,
      });
    }

    const values = await pool.items.many([...ids] as ItemId[]);
    return json({ values }, 200);
  };
}
