import type { JsonObject, JsonSchema } from "@notemap/core";

/**
 * What an account of this kind may carry besides its secret: are.na has no
 * username, and its address is the service's unless the account names another.
 * The token is sent to that address, so it is as trusted as the token. The host
 * owns the kind, the name and where the secret is read from.
 */
export const ARENA_ACCOUNT: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    baseUrl: {
      type: "string",
      pattern: "^https?://",
      description: "Where the API is reached. Absent is are.na itself.",
    },
  },
};

/** The whole of what this adapter is handed, and it never learns where it came from. */
export type ArenaCredential = {
  readonly token: string;
  /** Without a trailing slash. Absent is `ARENA_API`. */
  readonly baseUrl?: string;
};

export function asArenaCredential(
  held: JsonObject & { readonly secret: string },
): ArenaCredential {
  const baseUrl = held["baseUrl"];
  if (baseUrl !== undefined && typeof baseUrl !== "string") {
    throw new Error(
      `the arena account ${String(held["name"])} carries an address that is not a string`,
    );
  }

  return {
    token: held.secret,
    ...(baseUrl === undefined ? {} : { baseUrl: baseUrl.replace(/\/+$/, "") }),
  };
}

/**
 * Rejects where the account is not declared or its secret cannot be read.
 * Neither is the destination being wrong — the settings satisfy the schema — so
 * the message names what could not be read and the delivery reports it
 * unreachable.
 */
export type CredentialResolver = (account: string) => Promise<ArenaCredential>;
