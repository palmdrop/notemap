import type { Context } from "hono";

import type { JsonValue, Pool, PoolSettingName } from "@notemap/core";

import { errorBody, poolSettingStatus } from "../errors/refusals";
import { updatePoolSettingsRequestSchema } from "../schemas/settings";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

/** A read of pool state: it answers at once and cannot fail. */
export function poolSettingsHandler(pool: Pool) {
  return async (): Promise<Response> =>
    json({ values: await pool.settings.list() }, 200);
}

export function updatePoolSettingsHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, updatePoolSettingsRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const [[name, value]] = Object.entries(body.value) as [[string, unknown]];
    const result = await pool.settings.change(
      name as PoolSettingName,
      value as JsonValue,
    );
    if (result.kind === "refused") {
      return json(errorBody(result.refusal), poolSettingStatus(result.refusal));
    }

    return json({ values: await pool.settings.list() }, 200);
  };
}
