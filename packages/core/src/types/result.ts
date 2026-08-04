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

export type Slice<T> = {
  readonly values: readonly T[];
  readonly next?: PageCursor;
};
