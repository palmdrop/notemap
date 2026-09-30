import type { Pool } from "@notemap/core";

import { json } from "../utils/responses";

export function countsHandler(pool: Pool) {
  return async (): Promise<Response> => json(await pool.views.counts(), 200);
}
