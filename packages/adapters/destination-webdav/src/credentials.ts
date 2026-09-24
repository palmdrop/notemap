import type { JsonObject, JsonSchema } from "@notemap/core";

/**
 * What an account of this kind must carry besides its secret, which is a
 * **password**: that is what Basic authentication holds. The host owns the
 * account's kind and name and where its secret is read from, so none of them
 * is here. `additionalProperties: false` is what turns a misspelt key into a
 * refusal rather than an account missing what somebody meant to give it.
 *
 * The scheme is checked here rather than by the host: it is a statement about
 * Basic auth over a URL and means nothing to a kind that has no URL.
 */
export const WEBDAV_ACCOUNT: JsonSchema = {
  type: "object",
  required: ["baseUrl", "username"],
  additionalProperties: false,
  properties: {
    baseUrl: {
      type: "string",
      pattern: "^https?://",
      description: "The collection everything is resolved against.",
    },
    username: { type: "string", minLength: 1 },
  },
};

/**
 * An account the adapter may reach, resolved whole. The adapter is handed this
 * and never learns where it came from, which is what keeps the secret out of
 * core, out of the pool and out of anything `/v1` can answer with.
 */
export type WebdavCredential = {
  /** The collection everything is resolved against, without a trailing slash. */
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
};

/**
 * Read rather than cast: a schema that passed once is not a type. A trailing
 * slash is dropped here rather than at load, since what a base URL ends in is
 * this kind's business and nothing else's.
 */
export function asWebdavCredential(
  held: JsonObject & { readonly secret: string },
): WebdavCredential {
  const baseUrl = held["baseUrl"];
  const username = held["username"];

  if (typeof baseUrl !== "string" || typeof username !== "string") {
    throw new Error(
      `the webdav account ${String(held["name"])} carries no address and username`,
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    username,
    password: held.secret,
  };
}

/**
 * Rejects where the account is not declared or its secret cannot be read.
 * Neither is the destination being wrong — the settings satisfy the schema —
 * so the message names what could not be read and the delivery reports it
 * unreachable, on the same terms as an unmounted drive.
 */
export type CredentialResolver = (account: string) => Promise<WebdavCredential>;
