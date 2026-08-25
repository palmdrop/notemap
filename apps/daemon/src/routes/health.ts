import type { Pool } from "@notemap/core";

import { json } from "../utils/responses";

export function healthHandler(pool: Pool) {
  return async (): Promise<Response> =>
    json({ pool: await pool.identity() }, 200);
}
