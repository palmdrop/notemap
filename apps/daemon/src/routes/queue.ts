import type { Context } from "hono";

import type { PageRequest, Pool } from "@notemap/core";

import { pageUrl } from "../utils/positions";
import { readPageQuery } from "../utils/query";
import { json, refuse } from "../utils/responses";

/**
 * The queue and the archive: one read, one key, and a filter apiece. Both open
 * at the oldest end, which is what a list being worked through wants; a reader
 * who says otherwise gets otherwise.
 */
export type Surface = "queue" | "archived";

export function surfaceHandler(pool: Pool, surface: Surface) {
  return async (context: Context): Promise<Response> => {
    const query = readPageQuery(new URL(context.req.url), "oldest-first");
    if (!query.ok) return refuse(query.refusal);

    const page: PageRequest = {
      limit: query.limit,
      order: query.order,
      ...(query.after === undefined ? {} : { after: query.after }),
    };
    const slice = await pool.views[surface](page);

    return json(
      {
        values: slice.values,
        ...(slice.next === undefined
          ? {}
          : {
              next: pageUrl(
                `/v1/${surface}`,
                { order: query.order, limit: String(query.limit) },
                slice.next,
              ),
            }),
      },
      200,
    );
  };
}
