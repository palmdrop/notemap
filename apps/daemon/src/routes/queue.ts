import type { Context } from "hono";

import type { PageRequest, Pool } from "@notemap/core";

import { pageUrl } from "../utils/positions";
import { readPageQuery } from "../utils/query";
import { json, refuse } from "../utils/responses";

export type ItemView = Extract<keyof Pool["views"], "queue" | "archived">;

export function itemViewHandler(pool: Pool, view: ItemView) {
  return async (context: Context): Promise<Response> => {
    const query = readPageQuery(new URL(context.req.url), "oldest-first");
    if (!query.ok) return refuse(query.refusal);

    const page: PageRequest = {
      limit: query.limit,
      order: query.order,
      ...(query.after === undefined ? {} : { after: query.after }),
    };
    const slice = await pool.views[view](page);

    return json(
      {
        values: slice.values,
        ...(slice.next === undefined
          ? {}
          : {
              next: pageUrl(
                `/v1/${view}`,
                { order: query.order, limit: String(query.limit) },
                slice.next,
              ),
            }),
      },
      200,
    );
  };
}
