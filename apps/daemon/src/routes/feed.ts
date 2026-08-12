import type { Context } from "hono";

import type { Pool } from "@notemap/core";

import { pageUrl } from "../utils/positions";
import { readPageQuery } from "../utils/query";
import { json, refuse } from "../utils/responses";

export function feedHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const query = readPageQuery(new URL(context.req.url));
    if (!query.ok) return refuse(query.refusal);

    const slice = await pool.views.feed({
      order: query.order,
      limit: query.limit,
      ...(query.after === undefined ? {} : { after: query.after }),
    });

    return json(
      {
        values: slice.values,
        ...(slice.next === undefined
          ? {}
          : {
              next: pageUrl(
                "/v1/feed",
                { order: query.order, limit: String(query.limit) },
                slice.next,
              ),
            }),
      },
      200,
    );
  };
}
