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
 * Which end of the feed a read starts from. A read parameter rather than
 * configuration: core imposes no interface policy, so what a client shows first
 * is the client's to decide.
 */
export type FeedOrder = "newest-first" | "oldest-first";

/** A position belongs to no order, so one continues a read in either direction. */
export type FeedPage = Page & {
  readonly order?: FeedOrder;
};

export type Slice<T, P = Position> = {
  readonly values: readonly T[];
  readonly next?: P;
};
