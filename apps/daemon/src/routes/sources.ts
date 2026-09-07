import type { Pool } from "@notemap/core";

import { json } from "../utils/responses";

export function sourcesInUseHandler(pool: Pool) {
  return async (): Promise<Response> =>
    json({ values: await pool.sources.inUse() }, 200);
}
