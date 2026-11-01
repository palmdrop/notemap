/**
 * What a surface is read through, on its address and nowhere else: a surface
 * opened afresh is always the whole of it, so nothing here is remembered.
 */
import { filterOf, type Filter, type Order } from "@notemap/client";

import { PARAM as ORDER, withOrder } from "./order";
import { withView, type View } from "./view";

/** The kinds the panel chooses among. The words are typed, on a line of their own. */
export type FilterKind = Exclude<keyof Filter, "words">;

/** The words, as they were typed: the filter folds them, and the line shows them as written. */
export const WORDS = "words";

/** Each kind's parameter, in the order the address names them. */
export const PARAMS: Readonly<Record<FilterKind, string>> = {
  states: "state",
  destinations: "destination",
  sources: "source",
  tags: "tag",
};

const KINDS = Object.keys(PARAMS) as FilterKind[];

export function filterFor(url: URL): Filter {
  return filterOf({
    ...Object.fromEntries(
      KINDS.map((kind) => [kind, url.searchParams.getAll(PARAMS[kind])]),
    ),
    words: [wordsIn(url)],
  });
}

export function wordsIn(url: URL): string {
  return url.searchParams.get(WORDS) ?? "";
}

/** The same URL read through these words, or through none where they are blank. */
export function withWords(url: URL, words: string): URL {
  const next = new URL(url);
  if (words.trim() === "") next.searchParams.delete(WORDS);
  else next.searchParams.set(WORDS, words);
  return next;
}

/**
 * The same URL read through this filter, each kind in the order it was added.
 * The words stay as they were typed, unless the filter names none.
 */
export function withFilter(url: URL, filter: Filter): URL {
  const next = new URL(url);
  if (filter.words.length === 0) next.searchParams.delete(WORDS);
  for (const kind of KINDS) {
    next.searchParams.delete(PARAMS[kind]);
    for (const value of filter[kind])
      next.searchParams.append(PARAMS[kind], value);
  }
  return next;
}

/** One value taken into its kind, or out of it where it was there. */
export function toggled(
  filter: Filter,
  kind: FilterKind,
  value: string,
): Filter {
  const held: readonly string[] = filter[kind];
  return {
    ...filter,
    [kind]: held.includes(value)
      ? held.filter((each) => each !== value)
      : [...held, value],
  };
}

/**
 * The address a surface is read at through this filter, in this view and this
 * order. Both are named rather than read off the address, which the router's
 * copy of does not follow once either has been chosen with `replaceState`. An
 * address naming no order stays that way: turning one is remembered, and that
 * is what it reads.
 */
export function filtered(
  from: URL,
  filter: Filter,
  view: View,
  order: Order,
): URL {
  const to = withView(withFilter(from, filter), view);
  return from.searchParams.has(ORDER) ? withOrder(to, order) : to;
}

/**
 * Pushed, so going back takes the change back: a filter is somewhere a reader
 * went, where the order and the view are only how they read it.
 */
export const GOING = { noScroll: true, keepFocus: true } as const;

/** Where a filtered reading keeps its scroll, apart from the whole surface's. */
export function placeKey(surface: string, filter: Filter): string {
  const named = [...KINDS, "words" as const]
    .filter((kind) => filter[kind].length > 0)
    .map((kind) => `${kind}=${filter[kind].join("\u0000")}`);
  return named.length === 0 ? surface : `${surface}?${named.join("\u0001")}`;
}
