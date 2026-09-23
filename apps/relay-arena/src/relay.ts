import { createRelay, type Relay } from "@notemap/relay";
import { v5 as uuidv5 } from "uuid";

import { RELAY_ARENA } from "./constants";

/**
 * Fixed for a source's lifetime, because a changed namespace is a whole new set
 * of asset ids: every attachment would go up again and every block carrying one
 * would look edited. Derived rather than configured so there is nothing to keep
 * — the source id is already the one name a channel's relay instance has.
 */
export function namespaceFor(source: string): string {
  return uuidv5(source, RELAY_ARENA);
}

export type PoolTarget = {
  /** The daemon's base URL, without a trailing slash. */
  readonly url: string;
  readonly token: string;
  /** For a test that drives the relay without a socket. */
  readonly fetch?: typeof globalThis.fetch;
};

/** One instance per watched channel: the namespace and source differ per channel. */
export function relayInto(pool: PoolTarget, source: string): Relay {
  return createRelay({
    pool: {
      url: pool.url,
      token: pool.token,
      ...(pool.fetch === undefined ? {} : { fetch: pool.fetch }),
    },
    source,
    namespace: namespaceFor(source),
  });
}
