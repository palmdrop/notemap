import type { ActionKind, Order } from "@notemap/client";

import { PARAM } from "$lib/order";

import { KIND_PARAM } from "./views";

/**
 * The log as it is being read, narrowed to a subject or widened again. The
 * order travels with it: a shared link naming one is followed by somebody whose
 * own remembered order is not the one they were sent to. A surface that is not
 * the log names none, and the log opens the way it was last read.
 */
export function logHref(
  order: Order | undefined,
  item?: string,
  kinds?: readonly ActionKind[],
): string {
  const query = new URLSearchParams({
    ...(item === undefined ? {} : { item }),
    ...(kinds === undefined || kinds.length === 0
      ? {}
      : { [KIND_PARAM]: kinds.join(",") }),
    ...(order === undefined ? {} : { [PARAM]: order }),
  });
  return `/log?${query.toString()}`;
}
