import { onMount } from "svelte";

import type { Command } from "./command";

type Getter = () => readonly Command[];

let layers = $state<Getter[]>([]);

/**
 * Publishes one surface's commands for as long as it is mounted. Popped by
 * identity rather than by a single slot: SvelteKit can hold the outgoing and
 * the incoming page mounted at once, and a slot would be clobbered by
 * whichever effect runs last.
 */
export function publish(get: Getter): void {
  onMount(() => {
    layers = [...layers, get];
    return () => {
      layers = layers.filter((one) => one !== get);
    };
  });
}

/** Every layer live right now, top-most last: what a chord is resolved against. */
export function published(): readonly Getter[] {
  return layers;
}
