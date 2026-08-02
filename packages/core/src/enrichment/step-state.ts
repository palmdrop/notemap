/**
 * The state of one enrichment step for one item.
 *
 * Transcribed from ADR 7, whose point is that these are distinguishable from
 * outside: a client can always say whether anything is still coming, rather
 * than showing a perpetual "still working".
 */
export type StepState =
  | { readonly kind: "unavailable" }
  | { readonly kind: "not-applicable" }
  | { readonly kind: "pending" }
  | { readonly kind: "running" }
  | { readonly kind: "failed"; readonly attempts: number }
  | { readonly kind: "done" };

/**
 * Whether this step may still produce something without anyone asking.
 *
 * `failed` counts: ADR 7 gives it attempts and backoff, so it is a step that
 * retries rather than a step that has stopped.
 */
export function isWorkExpected(state: StepState): boolean {
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
