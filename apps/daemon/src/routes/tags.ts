import type { Context } from "hono";

import type { ItemId, Pool, TagName } from "@notemap/core";

import { errorBody, tagStatus } from "../errors/refusals";
import { tagRequestSchema } from "../schemas/tags";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

/**
 * Both halves, which differ only in which one they call. The wire carries no
 * agent: with no authentication there is nobody for a client to be, and the
 * attribution that is not a person's is written by accepting a suggestion,
 * which is core's own call rather than something a route is told.
 */
export function tagHandler(pool: Pool, half: "tag" | "untag") {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, tagRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const id = context.req.param("id") ?? "";
    const tag = body.value.tag as TagName;

    const result =
      half === "tag"
        ? await pool.items.tag(id as ItemId, tag, { kind: "person" })
        : await pool.items.untag(id as ItemId, tag);

    return result.kind === "refused"
      ? json(errorBody(result.refusal), tagStatus(result.refusal))
      : json(result.value, 200);
  };
}
