import type { Transport } from "../ports/transport";

/**
 * The web shell's half of the trivial pair. An empty `baseUrl` is same origin,
 * which is the arrangement `/v1` is defended by: the daemon serves the shell in
 * production and vite proxies to it in development.
 */
export function createFetchTransport(baseUrl = ""): Transport {
  return {
    baseUrl,
    fetch: (request) => globalThis.fetch(request),
  };
}
