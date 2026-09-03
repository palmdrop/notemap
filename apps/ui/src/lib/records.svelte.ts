import { saidBy, Unreachable, type RoutingRecord } from "@notemap/client";

import { client } from "./client";

/**
 * The routing records of one item. Nothing caches them, so this is the pool's
 * answer or it is nothing — which is why a change of item empties it rather
 * than leaving the last one's records under the new one's summary.
 *
 * Out of reach is not carried back: every surface reading these already says
 * whether the pool answers, and a second sentence saying it again in the
 * client's own words is noise. A refusal is carried, being the read failure a
 * person has to resolve.
 */
export function recordsOf(item: () => string | undefined, when: () => boolean) {
  let drawn = $state<readonly RoutingRecord[]>([]);
  let refused = $state("");
  let settled = $state(false);

  $effect(() => {
    const wanted = item();
    drawn = [];
    refused = "";
    settled = false;

    if (wanted === undefined || !when()) return;

    void (async () => {
      try {
        const answered = await client.routing.recordsFor(wanted);
        if (wanted === item()) {
          drawn = answered;
          settled = true;
        }
      } catch (error) {
        if (wanted === item() && !(error instanceof Unreachable)) {
          refused = saidBy(error);
          settled = true;
        }
      }
    })();
  });

  return {
    get all() {
      return drawn;
    },
    get refused() {
      return refused;
    },
    /** Whether the pool has answered for this item, an empty answer included. */
    get settled() {
      return settled;
    },
  };
}
