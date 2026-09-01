import type { Context } from "hono";

import type { Pool } from "@notemap/core";

import type { Auth } from "../auth/types";
import type { AppEnv } from "../types";
import { json } from "../utils/responses";
import { VERSION } from "../version";

/**
 * Open, because the shell probes it to tell a closed door from a dead daemon
 * and a `401` here would make the two look alike. Which pool this is, is a fact
 * about the pool, so it waits behind the door — but only where there is one: a
 * daemon nobody has set a password on answers everything, as it always did.
 */
export function healthHandler(pool: Pool, auth: Auth) {
  return async (context: Context<AppEnv>): Promise<Response> => {
    const known =
      context.get("identity") !== undefined ||
      !(await auth.requiresCredentials());

    return json(
      known
        ? { pool: await pool.identity(), version: VERSION }
        : { version: VERSION },
      200,
    );
  };
}
