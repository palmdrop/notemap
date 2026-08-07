import type { Branded } from "./branded";

/** Two variants only: anything that is not a domain refusal throws. */
export type Result<T, E> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "refused"; readonly refusal: E };

export type PageCursor = Branded<string, "PageCursor">;

export type Page = {
  readonly after?: PageCursor;
  readonly limit: number;
};

/**
 * Which end of the feed a read starts from. A read parameter rather than
 * configuration: core imposes no interface policy, so what a client shows first
 * is the client's to decide.
 */
export type FeedOrder = "newest-first" | "oldest-first";

/** A cursor belongs to the order it was issued for, and is refused under the other. */
export type FeedPage = Page & {
  readonly order?: FeedOrder;
};

export type Slice<T> = {
  readonly values: readonly T[];
  readonly next?: PageCursor;
};
