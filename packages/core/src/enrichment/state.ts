export type EnrichmentState =
  | { readonly kind: "unavailable" }
  | { readonly kind: "not-applicable" }
  | { readonly kind: "pending" }
  | { readonly kind: "running" }
  | { readonly kind: "failed"; readonly attempts: number }
  | { readonly kind: "done" };

/**
 * `failed` counts as work expected: a failed enrichment retries with backoff,
 * so it is waiting rather than stopped.
 */
export function isWorkExpected(state: EnrichmentState): boolean {
  switch (state.kind) {
    case "pending":
    case "running":
    case "failed":
      return true;
    case "unavailable":
    case "not-applicable":
    case "done":
      return false;
  }
}
