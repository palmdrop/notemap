import type { Context } from "hono";

import type { Page, Pool } from "@notemap/core";

import { pageUrl } from "../utils/positions";
import { readPage } from "../utils/query";
import { json, refuse } from "../utils/responses";

/**
 * The queue and the archive: the same read with two filters, and no order —
 * oldest first is what makes a queue a queue, and the archive is its other
 * half. The surface names its own path.
 */
export type Surface = "queue" | "archived";

export function surfaceHandler(pool: Pool, surface: Surface) {
  return async (context: Context): Promise<Response> => {
    const query = readPage(new URL(context.req.url));
    if (!query.ok) return refuse(query.refusal);

    const page: Page = {
      limit: query.limit,
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
                { limit: String(query.limit) },
                slice.next,
              ),
            }),
      },
      200,
    );
  };
}
