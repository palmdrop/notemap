/**
 * How the client reaches `/v1`. A shell binds one; the client knows nothing of
 * the origin, the proxy, or a credential a shell might one day carry.
 *
 * A transport that cannot reach the pool rejects, and the outbox reads that as
 * unreachable rather than as a refusal.
 */
export interface Transport {
  /** Where `/v1` is. Empty means same origin. */
  readonly baseUrl: string;
  fetch(request: Request): Promise<Response>;
  /**
   * Where a shell's own renderer reaches an asset's bytes. `fetch` cannot serve
   * this: an `<img>` makes the request itself, and carries neither a header this
   * transport would add nor a body it would read. A shell that is not a browser
   * on the pool's origin answers differently, which is why this is the port's
   * and not the client's.
   */
  assetUrl(asset: string): string;
}
