import type { ReadOrder } from "@notemap/core";

import { DEFAULT_LIMIT, MAX_LIMIT, READ_ORDERS } from "../constants";
import type { OrderedPageQuery, PageQuery } from "../types";
import { parsePosition } from "./positions";

export function readPage(url: URL): PageQuery {
  const rawLimit = url.searchParams.get("limit");
  const rawAfter = url.searchParams.get("after");

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

  if (rawAfter === null) return { ok: true, limit };

  const after = parsePosition(rawAfter);
  if (after === undefined) {
    return { ok: false, refusal: { kind: "bad-position", after: rawAfter } };
  }

  return { ok: true, limit, after };
}

export function readPageQuery(
  url: URL,
  fallback: ReadOrder = "newest-first",
): OrderedPageQuery {
  const rawOrder = url.searchParams.get("order");
  const order = (rawOrder ?? fallback) as ReadOrder;
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

  const page = readPage(url);
  return page.ok ? { ...page, order } : page;
}
