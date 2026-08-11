import type { Context } from "hono";

import type { Pool, ReadOrder } from "@notemap/core";

import { DEFAULT_LIMIT, MAX_LIMIT, READ_ORDERS } from "../constants";
import type { FeedQuery } from "../types";
import { feedUrl, parsePosition } from "../utils/positions";
import { json, refuse } from "../utils/responses";

export function readFeedQuery(url: URL): FeedQuery {
  const rawOrder = url.searchParams.get("order");
  const rawLimit = url.searchParams.get("limit");
  const rawAfter = url.searchParams.get("after");

  const order = (rawOrder ?? READ_ORDERS[0]) as ReadOrder;
  if (!READ_ORDERS.includes(order)) {
    return {
      ok: false,
      refusal: {
        kind: "bad-order",
        order: rawOrder ?? "",
        allowed: READ_ORDERS,
      },
    };
  }

  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    // Not `Number()`: it reads "" and " " as 0, and a limit the client did not
    // write is worse than one refused.
    if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1) {
      return { ok: false, refusal: { kind: "bad-limit", limit: rawLimit } };
    }
    limit = Number(rawLimit);
    if (limit > MAX_LIMIT) {
      return {
        ok: false,
        refusal: { kind: "limit-too-large", limit, max: MAX_LIMIT },
      };
    }
  }

  if (rawAfter === null) return { ok: true, order, limit };

  const after = parsePosition(rawAfter);
  if (after === undefined) {
    return { ok: false, refusal: { kind: "bad-position", after: rawAfter } };
  }

  return { ok: true, order, limit, after };
}

export function feedHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const query = readFeedQuery(new URL(context.req.url));
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
          : { next: feedUrl(query.order, query.limit, slice.next) }),
      },
      200,
    );
  };
}
