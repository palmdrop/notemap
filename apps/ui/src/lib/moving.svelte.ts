import { onMount, tick, untrack } from "svelte";

/**
 * Whether the rows a list is about to draw or drop got there by a read — a
 * page, a re-read, a turned order, the pool's first answer over the cache, the
 * cache itself filling an empty list — and so draw still. A read starts and
 * lands in the same update that flips `reading`, and a list going from nothing
 * to something was filled rather than added to — unless its nothing was the
 * pool's own answer, as a drained queue's is, when the first capture into it
 * is a change — so those updates and only those are still; every other change
 * is one a person should see move.
 */
export function moving(
  reading: () => boolean,
  count: () => number,
  answered: () => boolean = () => false,
): { readonly still: boolean } {
  let still = true;
  let was = untrack(reading);
  let held = untrack(count);
  let settled = untrack(answered);

  function settle(): void {
    still = true;
    void tick().then(() => (still = false));
  }

  $effect.pre(() => {
    const now = reading();
    const size = count();
    const filled = held === 0 && size > 0 && !settled;
    const turned = now !== was;
    was = now;
    held = size;
    settled = answered();
    if (filled || turned) settle();
  });

  onMount(settle);

  return {
    get still() {
      return still;
    },
  };
}
