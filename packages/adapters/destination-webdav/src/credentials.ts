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
 * Rejects where the profile is not declared or its secret cannot be read.
 * Neither is the destination being wrong — the settings satisfy the schema —
 * so the message names what could not be read and the delivery reports it
 * unreachable, on the same terms as an unmounted drive.
 */
export type CredentialResolver = (profile: string) => Promise<WebdavCredential>;
