import type { Pool } from "@notemap/core";

import { json } from "../utils/responses";
import { VERSION } from "../version";

export function healthHandler(pool: Pool) {
  return async (): Promise<Response> =>
    json({ pool: await pool.identity(), version: VERSION }, 200);
}
