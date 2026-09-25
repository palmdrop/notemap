import { onMount, tick, untrack } from "svelte";

/**
 * Whether the rows a list is about to draw or drop got there by a read — a
 * page, a re-read, a turned order, the pool's first answer over the cache —
 * and so draw still. A read starts and lands in the same update that flips
 * `reading`, so that update and only that one is still; every other change is
 * one a person should see move. The first draw is still too.
 */
export function moving(reading: () => boolean): { readonly still: boolean } {
  let still = true;
  let was = untrack(reading);

  function settle(): void {
    still = true;
    void tick().then(() => (still = false));
  }

  $effect.pre(() => {
    const now = reading();
    if (now === was) return;
    was = now;
    settle();
  });

  onMount(settle);

  return {
    get still() {
      return still;
    },
  };
}
