import { getContext, onMount, setContext } from "svelte";

import type { Command } from "./command";

type Getter = () => readonly Command[];
type Layer = {
  readonly depth: number;
  readonly get: Getter;
  readonly holds: boolean;
};

const DEPTH = Symbol("how deeply nested a publishing surface is");

let layers = $state<Layer[]>([]);

/**
 * Publishes one surface's commands for as long as it is mounted. Sorted by
 * how deeply nested the surface is, so a surface drawn inside another
 * outranks it whatever order the two mounted in — a child's `onMount` runs
 * before its parent's, which would otherwise put the parent on top. Ties keep
 * the order they mounted in, and are popped by identity: SvelteKit can hold
 * the outgoing and the incoming page mounted at once, and a single slot would
 * be clobbered by whichever effect runs last.
 *
 * A layer that `holds` is the only way on until it goes: nothing beneath it
 * is reached, and a surface asking `holding()` knows not to move under it.
 */
export function publish(
  get: Getter,
  { holds = false }: { holds?: boolean } = {},
): void {
  const depth = (getContext<number | undefined>(DEPTH) ?? 0) + 1;
  setContext(DEPTH, depth);

  onMount(() => {
    layers = [...layers, { depth, get, holds }].sort(
      (one, two) => one.depth - two.depth,
    );
    return () => {
      layers = layers.filter((one) => one.get !== get);
    };
  });
}

/** Every layer live right now, top-most last: what a chord is resolved against. */
export function published(): readonly Getter[] {
  const from = layers.findLastIndex((layer) => layer.holds);
  return layers.slice(Math.max(from, 0)).map((layer) => layer.get);
}

/** Whether a layer is holding everything beneath it. */
export function holding(): boolean {
  return layers.some((layer) => layer.holds);
}
