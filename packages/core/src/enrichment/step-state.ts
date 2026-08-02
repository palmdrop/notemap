/**
 * The state of one enrichment step for one item.
 *
 * Every state is distinguishable from outside, so a client can always say
 * whether anything is still coming rather than showing a perpetual
 * "still working".
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
 * `failed` counts: a failed step retries with backoff, so it is a step that
 * is waiting rather than a step that has stopped.
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
