/**
 * The tags a surface is read through, on its address and nowhere else: a
 * surface opened afresh is always the whole of it, so nothing here is
 * remembered.
 */
import { filterOf, type Order } from "@notemap/client";

import { PARAM as ORDER, withOrder } from "./order";
import { withView, type View } from "./view";

export const PARAM = "tag";

export function filterFor(url: URL): readonly string[] {
  return filterOf(url.searchParams.getAll(PARAM));
}

/** The same URL read through these tags, in the order they were added. */
export function withFilter(url: URL, tags: readonly string[]): URL {
  const next = new URL(url);
  next.searchParams.delete(PARAM);
  for (const tag of tags) next.searchParams.append(PARAM, tag);
  return next;
}

/**
 * The address a surface is read at through these tags, in this view and this
 * order. Both are named rather than read off the address, which the router's
 * copy of does not follow once either has been chosen with `replaceState`. An
 * address naming no order stays that way: turning one is remembered, and that
 * is what it reads.
 */
export function filtered(
  from: URL,
  tags: readonly string[],
  view: View,
  order: Order,
): URL {
  const to = withView(withFilter(from, tags), view);
  return from.searchParams.has(ORDER) ? withOrder(to, order) : to;
}

/**
 * Pushed, so going back takes the change back: a filter is somewhere a reader
 * went, where the order and the view are only how they read it.
 */
export const GOING = { noScroll: true, keepFocus: true } as const;

/** Where a filtered reading keeps its scroll, apart from the whole surface's. */
export function placeKey(surface: string, tags: readonly string[]): string {
  return tags.length === 0 ? surface : `${surface}?${tags.join("\u0000")}`;
}
