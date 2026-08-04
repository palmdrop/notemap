export type Result<T, E> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "refused"; readonly refusal: E };
