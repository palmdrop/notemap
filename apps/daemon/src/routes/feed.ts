import type { Context } from "hono";

import type { Pool } from "@notemap/core";

import { pageUrl } from "../utils/positions";
import { readPageQuery, readTagFilter } from "../utils/query";
import { json, refuse } from "../utils/responses";

export function feedHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const url = new URL(context.req.url);
    const query = readPageQuery(url);
    if (!query.ok) return refuse(query.refusal);
    const tags = readTagFilter(url);
    if (!tags.ok) return refuse(tags.refusal);

    const slice = await pool.views.feed(
      {
        order: query.order,
        limit: query.limit,
        ...(query.after === undefined ? {} : { after: query.after }),
      },
      tags.filter,
    );

    return json(
      {
        values: slice.values,
        ...(slice.next === undefined
          ? {}
          : {
              next: pageUrl(
                "/v1/feed",
                {
                  order: query.order,
                  limit: String(query.limit),
                  tag: tags.filter,
                },
                slice.next,
              ),
            }),
      },
      200,
    );
  };
}
