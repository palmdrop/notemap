import { isIP } from "node:net";

import { createUnfurlCache } from "./cache";
import { extract } from "./extract";
import { hostOf, refusedAddress, unfurlable } from "./guard";
import { MAX_REDIRECTS, UNFURL_TIMEOUT_MS } from "./limits";
import type {
  Address,
  PinnedFetch,
  Resolve,
  Unfurler,
  UnfurlResult,
} from "./types";

export type UnfurlerPorts = {
  readonly resolve: Resolve;
  readonly fetch: PinnedFetch;
  readonly now: () => number;
};

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** The first hop's address is the caller's to answer for; a later one is the target's doing. */
type Hop =
  | { readonly kind: "address"; readonly address: Address }
  | { readonly kind: "refused" }
  | { readonly kind: "unresolved" };

export function createUnfurler(ports: UnfurlerPorts): Unfurler {
  const cache = createUnfurlCache(ports.now);
  const inFlight = new Map<string, Promise<UnfurlResult>>();

  async function addressOf(url: URL): Promise<Hop> {
    const host = hostOf(url);
    let addresses: readonly Address[];
    const literal = isIP(host);
    if (literal === 4 || literal === 6) {
      addresses = [{ address: host, family: literal }];
    } else {
      try {
        addresses = await ports.resolve(host);
      } catch {
        return { kind: "unresolved" };
      }
    }
    const [first] = addresses;
    if (first === undefined) return { kind: "unresolved" };
    if (addresses.some((each) => refusedAddress(each.address))) {
      return { kind: "refused" };
    }
    return { kind: "address", address: first };
  }

  async function read(asked: string, start: URL): Promise<UnfurlResult> {
    const nothing: UnfurlResult = {
      ok: true,
      value: { url: asked, reached: false },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UNFURL_TIMEOUT_MS);
    const deadline = new Promise<"timeout">((resolve) =>
      controller.signal.addEventListener("abort", () => resolve("timeout")),
    );

    try {
      let url = start;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const found = await Promise.race([addressOf(url), deadline]);
        if (found === "timeout") return nothing;
        if (found.kind === "refused") {
          return hop === 0
            ? { ok: false, refusal: { kind: "address-refused", url: asked } }
            : nothing;
        }
        if (found.kind === "unresolved") return nothing;

        const fetched = await Promise.race([
          ports.fetch(url, found.address, controller.signal),
          deadline,
        ]);
        if (fetched === "timeout") return nothing;

        if (REDIRECTS.has(fetched.status)) {
          const next =
            fetched.location === undefined
              ? undefined
              : unfurlable(new URL(fetched.location, url).href);
          if (next === undefined) return nothing;
          url = next;
          continue;
        }
        if (fetched.status < 200 || fetched.status >= 300) return nothing;

        const type = fetched.contentType?.split(";")[0]?.trim().toLowerCase();
        if (type?.startsWith("image/") === true) {
          return {
            ok: true,
            value: { url: asked, reached: true, image: url.href },
          };
        }
        const html = type === "text/html" || type === "application/xhtml+xml";
        return {
          ok: true,
          value: {
            url: asked,
            reached: true,
            ...(html ? extract(fetched.body, url) : {}),
          },
        };
      }
      return nothing;
    } catch {
      return nothing;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  return {
    async unfurl(asked) {
      const start = unfurlable(asked);
      if (start === undefined) {
        return { ok: false, refusal: { kind: "bad-url", url: asked } };
      }

      const held = cache.get(asked);
      if (held !== undefined) return { ok: true, value: held };

      const pending = inFlight.get(asked);
      if (pending !== undefined) return pending;

      const reading = read(asked, start).then((result) => {
        if (result.ok) cache.set(asked, result.value);
        return result;
      });
      inFlight.set(asked, reading);
      try {
        return await reading;
      } finally {
        inFlight.delete(asked);
      }
    },
  };
}
