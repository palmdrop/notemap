import { on } from "svelte/events";
import { createSubscriber } from "svelte/reactivity";

/**
 * `--breakpoint-wide` and `--breakpoint-full` in `tokens.css`. Read from
 * script where a piece is a different component at each width, and not a
 * different look that a class could give it.
 */
export const WIDE_PX = 900;
export const FULL_PX = 1200;

/**
 * The window's width as of its last resize. Reading `innerWidth` itself lays
 * the page out again wherever anything has changed since, and a list redrawn
 * reads it once a row.
 */
let across = typeof window === "undefined" ? 0 : window.innerWidth;
if (typeof window !== "undefined") {
  on(window, "resize", () => (across = window.innerWidth));
}

export function wide(): boolean {
  return across >= WIDE_PX;
}

export function full(): boolean {
  return across >= FULL_PX;
}

type Form = { readonly wide: boolean; readonly full: boolean };

const form = (): Form => ({ wide: wide(), full: full() });

/** The form readers were last woken for, while anything reads it. */
let held: Form | undefined;

// A phone resizes as it scrolls: every row woken on every resize was the whole
// cost of a scroll, so readers are woken only when a breakpoint is crossed.
const crossed = createSubscriber((update) => {
  held = form();
  const off = on(window, "resize", () => {
    const now = form();
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
    return wide();
  },
  get full(): boolean {
    crossed();
    return full();
  },
};
