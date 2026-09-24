import {
  FAILED_UNFURL_LIFETIME_MS,
  MAX_UNFURLS_HELD,
  UNFURL_LIFETIME_MS,
} from "./limits";
import type { UnfurlResult } from "./types";

type Held = { readonly result: UnfurlResult; readonly until: number };

export type UnfurlCache = {
  get(url: string): UnfurlResult | undefined;
  /** A refusal is held too, for as long as a failure: it cost a name lookup to reach. */
  set(url: string, result: UnfurlResult): void;
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
      return entry.result;
    },
    set(url, result) {
      held.delete(url);
      const lifetime =
        result.ok && result.value.reached
          ? UNFURL_LIFETIME_MS
          : FAILED_UNFURL_LIFETIME_MS;
      held.set(url, { result, until: now() + lifetime });
      while (held.size > MAX_UNFURLS_HELD) {
        const oldest = held.keys().next();
        if (oldest.done === true) break;
        held.delete(oldest.value);
      }
    },
  };
}
