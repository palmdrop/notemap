import { base } from "../../stryker.base.mjs";

/**
 * `pool.ts` is left out. It is a composition root: every slice hands its
 * arguments to the submodule that does the work, and each of those is mutated
 * where it lives. What a mutant in a one-line delegate catches is a swapped
 * import, which the daemon and client suites catch by calling it end to end —
 * and 72 of them answering for nothing would be most of this package's score.
 */
export default {
  ...base,
  mutate: [...base.mutate, "!src/pool/pool.ts"],
};
