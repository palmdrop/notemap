import type { Transport } from "../ports/transport";

export function createFetchTransport(baseUrl = ""): Transport {
  return {
    baseUrl,
    fetch: (request) => globalThis.fetch(request),
  };
}
