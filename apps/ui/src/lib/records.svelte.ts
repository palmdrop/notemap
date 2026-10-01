import { saidBy, Unreachable, type RoutingRecord } from "@notemap/client";

import { client } from "./client";

/**
 * The routing records of one item. Nothing caches them, so this is the pool's
 * answer or it is nothing — which is why a change of item empties it rather
 * than leaving the last one's records under the new one's summary. Reading the
 * same item again keeps what is drawn until the answer replaces it: emptied, a
 * routing line would fall back to the summary for the length of a request.
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
  let again = $state(0);
  let read: string | undefined;
  let asked = 0;

  $effect(() => {
    void again;
    const wanted = when() ? item() : undefined;
    if (wanted !== read) {
      drawn = [];
      settled = false;
    }
    read = wanted;
    refused = "";

    const mine = ++asked;
    if (wanted === undefined) return;

    // Only the latest read draws: two of the same item can answer out of order.
    void (async () => {
      try {
        const answered = await client.routing.recordsFor(wanted);
        if (mine === asked) {
          drawn = answered;
          settled = true;
        }
      } catch (error) {
        if (mine === asked && !(error instanceof Unreachable)) {
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
    /** A decision taken back leaves what is drawn a record out of date. */
    reread() {
      again += 1;
    },
  };
}
