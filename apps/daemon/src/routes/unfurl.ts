import type { Context } from "hono";

import type { Pool } from "@notemap/core";

import { errorBody, unfurlStatus } from "../errors/refusals";
import type { Unfurler } from "../unfurl";
import { json } from "../utils/responses";

const SETTING = "unfurl";

export function unfurlHandler(pool: Pool, unfurler: Unfurler) {
  return async (context: Context): Promise<Response> => {
    const settings = await pool.settings.list();
    const on = settings.find((each) => each.name === SETTING)?.value === true;
    if (!on) {
      const refusal = { kind: "unfurl-off", setting: SETTING } as const;
      return json(errorBody(refusal), unfurlStatus(refusal));
    }

    const url = new URL(context.req.url).searchParams.get("url") ?? "";
    const result = await unfurler.unfurl(url);
    if (!result.ok) {
      return json(errorBody(result.refusal), unfurlStatus(result.refusal));
    }
    return json(result.value, 200);
  };
}
