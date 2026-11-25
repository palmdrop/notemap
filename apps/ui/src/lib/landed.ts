import type { Order } from "@notemap/client";

import { notices } from "./notices.svelte";

/** Where a new capture lands in the queue, read in this order. */
export function landedAt(order: Order): string {
  return order === "oldest-first"
    ? "Captured, at the end of the queue"
    : "Captured, at the top of the queue";
}

/**
 * Says where a capture landed, which is out of sight when the oldest come
 * first, with Show bringing its row into view once it is drawn.
 */
export function sayLanded(item: string, order: Order): void {
  notices.raise({
    what: landedAt(order),
    key: `landed:${item}`,
    offer: {
      label: "Show",
      take: () =>
        document
          .querySelector(`[data-row="${item}"]`)
          ?.scrollIntoView({ block: "center" }),
    },
  });
}
