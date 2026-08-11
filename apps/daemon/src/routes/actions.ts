import type { Context } from "hono";

import type { ItemId, Pool } from "@notemap/core";

import { pageUrl } from "../utils/positions";
import { readPageQuery } from "../utils/query";
import { json, refuse } from "../utils/responses";

export function actionsHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const url = new URL(context.req.url);
    const query = readPageQuery(url);
    if (!query.ok) return refuse(query.refusal);

    // Not checked against the pool: the log outlives the material, so an id no
    // item has is a filter that matches nothing rather than a mistake.
    const item = url.searchParams.get("item") ?? undefined;

    const page = {
      order: query.order,
      limit: query.limit,
      ...(query.after === undefined ? {} : { after: query.after }),
    };
    const slice =
      item === undefined
        ? await pool.actions.all(page)
        : await pool.actions.forItem(item as ItemId, page);

    return json(
      {
        values: slice.values,
        ...(slice.next === undefined
          ? {}
          : {
              next: pageUrl(
                "/v1/actions",
                {
                  order: query.order,
                  limit: String(query.limit),
                  ...(item === undefined ? {} : { item }),
                },
                slice.next,
              ),
            }),
      },
      200,
    );
  };
}
