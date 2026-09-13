import type { Context } from "hono";

import {
  ACTION_KINDS,
  type ActionKind,
  type ItemId,
  type Pool,
} from "@notemap/core";

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

    const rawKind = url.searchParams.get("kind");
    const kinds = rawKind === null ? [] : rawKind.split(",");
    const unknown = kinds.find(
      (kind) => !(ACTION_KINDS as readonly string[]).includes(kind),
    );
    if (unknown !== undefined) {
      return refuse({
        kind: "bad-kind",
        value: unknown,
        allowed: ACTION_KINDS,
      });
    }

    const page = {
      order: query.order,
      limit: query.limit,
      ...(query.after === undefined ? {} : { after: query.after }),
    };
    const slice = await pool.actions.read(
      {
        ...(item === undefined ? {} : { item: item as ItemId }),
        ...(kinds.length === 0 ? {} : { kinds: kinds as ActionKind[] }),
      },
      page,
    );

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
                  ...(rawKind === null ? {} : { kind: rawKind }),
                },
                slice.next,
              ),
            }),
      },
      200,
    );
  };
}
