declare const brand: unique symbol;

/** Opaque to callers; only the store that issued one knows how to resume from it. */
export type PageCursor = string & { readonly [brand]: "PageCursor" };

export type Page = {
  readonly after?: PageCursor;
  readonly limit: number;
};

export type Slice<T> = {
  readonly values: readonly T[];
  readonly next?: PageCursor;
};
