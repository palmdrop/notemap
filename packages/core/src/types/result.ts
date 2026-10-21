import type { Position } from "./domain/position";

/** Two variants only: anything that is not a domain refusal throws. */
export type Result<T, E> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "refused"; readonly refusal: E };

/** Continued from the position the previous slice handed back, if there was one. */
export type Page<P = Position> = {
  readonly after?: P;
  readonly limit: number;
};

/**
 * Which end of a surface a read starts from. A read parameter rather than
 * configuration: core imposes no interface policy, so what a client shows first
 * is the client's to decide.
 */
export type ReadOrder = "newest-first" | "oldest-first";

export type PageRequest<P = Position> = Page<P> & {
  readonly order?: ReadOrder;
};

/** A position belongs to no order, so one continues a read in either direction. */
export type OrderedPage<P = Position> = Page<P> & {
  readonly order: ReadOrder;
};

/**
 * Which instant the feed is read by: capture time, or when it was processed. A position
 * belongs to the key of the read it came from.
 */
export type FeedKey = "capture" | "processed";

export const FEED_KEYS: readonly FeedKey[] = ["capture", "processed"];

export type FeedPageRequest = PageRequest & { readonly by?: FeedKey };

/** Capture time where it names no key. */
export type FeedPage = OrderedPage & { readonly by?: FeedKey };

export type Slice<T, P = Position> = {
  readonly values: readonly T[];
  readonly next?: P;
};
