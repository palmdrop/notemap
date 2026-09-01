import type { Transport } from "#ports/transport";

export type FetchTransportOptions = {
  /**
   * An access token, for a client that is not a browser and so holds no cookie.
   * It reaches every route a session does but the ones that manage tokens and
   * end sessions, which are a session's alone.
   */
  readonly token?: string;
};

export function createFetchTransport(
  baseUrl = "",
  options: FetchTransportOptions = {},
): Transport {
  const { token } = options;

  return {
    baseUrl,
    fetch: (request) => {
      if (token === undefined) return globalThis.fetch(request);

      const headers = new Headers(request.headers);
      headers.set("authorization", `Bearer ${token}`);

      return globalThis.fetch(new Request(request, { headers }));
    },
    /**
     * The token cannot ride here: a renderer fetches this URL itself and sets
     * no header. A shell carrying one reads the bytes through `fetch` instead,
     * or serves them from somewhere it can reach.
     */
    assetUrl: (asset) =>
      `${baseUrl}/v1/assets/${encodeURIComponent(asset)}/content`,
  };
}
