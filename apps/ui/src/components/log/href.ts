import type { Order } from "@notemap/client";

import { PARAM } from "$lib/order";

/**
 * The log as it is being read, narrowed to a subject or widened again. The
 * order travels with it: a shared link naming one is followed by somebody whose
 * own remembered order is not the one they were sent to.
 */
export function logHref(order: Order, item?: string): string {
  const query = new URLSearchParams({
    ...(item === undefined ? {} : { item }),
    [PARAM]: order,
  });
  return `/log?${query.toString()}`;
}
