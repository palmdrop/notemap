import {
  FAILED_UNFURL_LIFETIME_MS,
  MAX_UNFURLS_HELD,
  UNFURL_LIFETIME_MS,
} from "./limits";
import type { Unfurl } from "./types";

type Held = { readonly unfurl: Unfurl; readonly until: number };

export type UnfurlCache = {
  get(url: string): Unfurl | undefined;
  set(url: string, unfurl: Unfurl): void;
};

/** In memory only. A `Map` keeps insertion order, so its first key is the oldest. */
export function createUnfurlCache(now: () => number): UnfurlCache {
  const held = new Map<string, Held>();

  return {
    get(url) {
      const entry = held.get(url);
      if (entry === undefined) return undefined;
      if (entry.until <= now()) {
        held.delete(url);
        return undefined;
      }
      return entry.unfurl;
    },
    set(url, unfurl) {
      held.delete(url);
      const lifetime = unfurl.reached
        ? UNFURL_LIFETIME_MS
        : FAILED_UNFURL_LIFETIME_MS;
      held.set(url, { unfurl, until: now() + lifetime });
      while (held.size > MAX_UNFURLS_HELD) {
        const oldest = held.keys().next();
        if (oldest.done === true) break;
        held.delete(oldest.value);
      }
    },
  };
}
