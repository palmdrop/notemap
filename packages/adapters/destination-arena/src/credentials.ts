import type { JsonObject, JsonSchema } from "@notemap/core";

import { ARENA } from "./settings";

/**
 * What an account of this kind must carry, checked when the daemon starts, and
 * it is only the secret: are.na has no username, and its address is a constant
 * of the service rather than anything an operator supplies.
 *
 * `secretFile` and `secretEnv` rather than `password*`: a bearer token is not a
 * password, and `token` is spent — in notemap an **access token** is a
 * credential notemap issues, and an account's secret is never notemap's.
 */
export const ARENA_ACCOUNT: JsonSchema = {
  type: "object",
  required: ["kind", "name"],
  additionalProperties: false,
  properties: {
    kind: { const: ARENA },
    name: { type: "string", minLength: 1 },
    secretFile: { type: "string", minLength: 1 },
    secretEnv: { type: "string", minLength: 1 },
  },
};

/** The whole of what this adapter is handed, and it never learns where it came from. */
export type ArenaCredential = {
  readonly token: string;
};

export function asArenaCredential(
  held: JsonObject & { readonly secret: string },
): ArenaCredential {
  return { token: held.secret };
}

/**
 * Rejects where the account is not declared or its secret cannot be read.
 * Neither is the destination being wrong — the settings satisfy the schema — so
 * the message names what could not be read and the delivery reports it
 * unreachable.
 */
export type CredentialResolver = (account: string) => Promise<ArenaCredential>;
