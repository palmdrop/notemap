import type { OrderedPage, PageRequest, ReadOrder } from "../types/result";

/** Newest first, for every surface that takes an order: a reader wants the latest end. */
const DEFAULT_ORDER: ReadOrder = "newest-first";

/**
 * Settles the order a caller left open, so a store is never handed a page that
 * does not say which end it starts from and never gets to decide.
 */
export function ordered<P>(page: PageRequest<P>): OrderedPage<P> {
  return { ...page, order: page.order ?? DEFAULT_ORDER };
}
