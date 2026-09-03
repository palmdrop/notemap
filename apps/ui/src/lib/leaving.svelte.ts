import { SvelteMap } from "svelte/reactivity";

import type { Item } from "@notemap/client";

/** One beat: long enough to be seen leaving, short enough not to be read. */
const HOLDS = 1_200;

export type Going = {
  readonly item: Item;
  readonly word: string;
  /** The row it stood above, so it goes from where it was rather than the foot. */
  readonly before?: string;
};

const held = new SvelteMap<string, Going>();
const timers = new SvelteMap<string, ReturnType<typeof setTimeout>>();

/**
 * A row on its way off a surface, and the word it goes wearing. The item has
 * already left as far as the client is concerned; this is the shell drawing
 * what it just did, and it makes no claim about what the pool holds — which is
 * why nothing on it can be opened or acted on.
 */
export const leaving = {
  after(item: Item, word: string, before?: string): void {
    if (stillness()) return;

    clearTimeout(timers.get(item.id));
    held.set(item.id, {
      item,
      word,
      ...(before === undefined ? {} : { before }),
    });
    timers.set(
      item.id,
      setTimeout(() => {
        held.delete(item.id);
        timers.delete(item.id);
      }, HOLDS),
    );
  },

  going(): readonly Going[] {
    return [...held.values()];
  },

  clear(): void {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    held.clear();
  },
};

/**
 * A reader who has asked for less movement is shown none: the row goes at once
 * rather than lingering more briefly.
 */
function stillness(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
