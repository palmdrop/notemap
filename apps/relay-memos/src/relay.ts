import { createRelay, type Relay } from "@notemap/relay";
import { v5 as uuidv5 } from "uuid";

import { RELAY_MEMOS } from "./constants";
import type { RelayConfig } from "./config/load";

/**
 * Fixed for a source's lifetime, because a changed namespace is a whole new set
 * of asset ids: every attachment would go up again and every memo carrying one
 * would look edited. Derived rather than configured so there is nothing to keep
 * — the source id is already the one name a relay instance has.
 */
export function namespaceFor(source: string): string {
  return uuidv5(source, RELAY_MEMOS);
}

export function relayInto(
  config: RelayConfig,
  token: string,
  fetch?: typeof globalThis.fetch,
): Relay {
  return createRelay({
    pool: {
      url: config.pool.url,
      token,
      ...(fetch === undefined ? {} : { fetch }),
    },
    source: config.pool.source,
    namespace: namespaceFor(config.pool.source),
  });
}
