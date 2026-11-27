import { on } from "svelte/events";
import { createSubscriber } from "svelte/reactivity";

/**
 * `--breakpoint-wide` and `--breakpoint-full` in `tokens.css`. Read from
 * script where a piece is a different component at each width, and not a
 * different look that a class could give it.
 */
export const WIDE_PX = 900;
export const FULL_PX = 1200;

export function wide(): boolean {
  return window.innerWidth >= WIDE_PX;
}

export function full(): boolean {
  return window.innerWidth >= FULL_PX;
}

type Form = { readonly wide: boolean; readonly full: boolean };

function measured(): Form {
  const across = window.innerWidth;
  return { wide: across >= WIDE_PX, full: across >= FULL_PX };
}

/** Held only while something listens, since nothing else keeps it current. */
let held: Form | undefined;

// A phone resizes as it scrolls, and `innerWidth` lays the page out to answer:
// read by every row on every resize, that was the whole cost of a scroll.
const crossed = createSubscriber((update) => {
  held = measured();
  const off = on(window, "resize", () => {
    const now = measured();
    if (now.wide === held?.wide && now.full === held.full) return;
    held = now;
    update();
  });
  return () => {
    off();
    held = undefined;
  };
});

/** The width's form, read reactively: a piece re-draws as the window crosses a breakpoint. */
export const width = {
  get wide(): boolean {
    crossed();
    return (held ?? measured()).wide;
  },
  get full(): boolean {
    crossed();
    return (held ?? measured()).full;
  },
};
