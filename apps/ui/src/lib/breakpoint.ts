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
let measured = typeof window === "undefined" ? 0 : window.innerWidth;
if (typeof window !== "undefined") {
  on(window, "resize", () => (measured = window.innerWidth));
}

export function wide(): boolean {
  return measured >= WIDE_PX;
}

export function full(): boolean {
  return measured >= FULL_PX;
}

const resized = createSubscriber((update) => on(window, "resize", update));

/** The width's form, read reactively: a piece re-draws as the window crosses a breakpoint. */
export const width = {
  get wide(): boolean {
    resized();
    return wide();
  },
  get full(): boolean {
    resized();
    return full();
  },
};
