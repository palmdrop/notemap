import {
  createClient,
  createFetchTransport,
  createMemoryStore,
  type Client,
  type Transport,
} from "@notemap/client";

/**
 * Node's `fetch` keeps no cookies, so the jar a browser is has to be the
 * suite's own — and without one nothing here would exercise a session at all,
 * which is how a cookie the daemon issues but no browser accepts got as far as
 * it did.
 *
 * Deliberately credulous: it holds whatever it is sent, under whatever name,
 * and sends it back to the same daemon. What a browser would *refuse* is not
 * for this to decide, and a test that cares asserts on the header itself.
 */
export function keepingCookies(url: string): Transport {
  const held = new Map<string, string>();
  const transport = createFetchTransport(url);

  return {
    ...transport,
    async fetch(request) {
      if (held.size > 0) {
        request.headers.set(
          "cookie",
          [...held].map(([name, value]) => `${name}=${value}`).join("; "),
        );
      }

      const response = await transport.fetch(request);
      for (const said of response.headers.getSetCookie()) take(held, said);

      return response;
    },
  };
}

/** One client over one daemon, carrying its cookies the way a browser would. */
export function browser(url: string): Client {
  return createClient({
    transport: keepingCookies(url),
    store: createMemoryStore(),
  });
}

/** A cookie whose lifetime has already run out is a cookie being taken away. */
function take(held: Map<string, string>, said: string): void {
  const [pair, ...attributes] = said.split(";");
  const at = pair?.indexOf("=") ?? -1;
  if (pair === undefined || at < 1) return;

  const name = pair.slice(0, at).trim();
  const expiry = attributes
    .map((attribute) => attribute.trim().toLowerCase())
    .find((attribute) => attribute.startsWith("expires="));

  const gone =
    attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute)) ||
    (expiry !== undefined &&
      new Date(expiry.slice("expires=".length)) <= new Date());

  if (gone) held.delete(name);
  else held.set(name, pair.slice(at + 1).trim());
}
