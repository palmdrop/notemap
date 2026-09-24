import type { JsonObject, JsonSchema } from "@notemap/core";

/**
 * What an account of this kind must carry besides its secret, which is nothing:
 * are.na has no username, and its address is a constant of the service rather
 * than anything an operator supplies. The host owns the kind, the name and
 * where the secret is read from.
 */
export const ARENA_ACCOUNT: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
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
