import type { Context } from "hono";

import type { Agent, ItemId, Pool, TagName } from "@notemap/core";

import { errorBody, tagStatus } from "../errors/refusals";
import { tagRequestSchema } from "../schemas/tags";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

export function tagHandler(pool: Pool, half: "tag" | "untag") {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, tagRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const id = context.req.param("id") ?? "";
    const tag = body.value.tag as TagName;
    const by: Agent = { kind: "person" };

    // Only the tagging half can reach a destination, and so only it is given
    // the signal: untagging is store work and finishes.
    const result =
      half === "tag"
        ? await pool.items.tag(id as ItemId, tag, by, context.req.raw.signal)
        : await pool.items.untag(id as ItemId, tag, by);

    return result.kind === "refused"
      ? json(errorBody(result.refusal), tagStatus(result.refusal))
      : json(result.value, 200);
  };
}

export function tagsInUseHandler(pool: Pool) {
  return async (): Promise<Response> =>
    json({ values: await pool.tags.inUse() }, 200);
}
