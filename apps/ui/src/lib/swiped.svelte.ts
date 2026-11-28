import { on } from "svelte/events";

let id = $state<string | undefined>(undefined);
let unwatch: (() => void) | undefined;

function shut(): void {
  id = undefined;
  unwatch?.();
  unwatch = undefined;
}

/**
 * The one row swiped open on its actions, on a phone. Opening one shuts any
 * other, and a scroll anywhere shuts it: a row left open under a list that has
 * moved on would act on what is no longer in front of the finger.
 */
export const swiped = {
  get id(): string | undefined {
    return id;
  },

  open(row: string): void {
    shut();
    id = row;
    unwatch = on(window, "scroll", shut, { capture: true, passive: true });
  },

  shut,
};
