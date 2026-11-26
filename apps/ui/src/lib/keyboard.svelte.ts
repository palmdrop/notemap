import { on } from "svelte/events";

import { width } from "./breakpoint";

/** Inputs a phone raises its keyboard for. */
const TYPED = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
]);

/** Less than this much shorter than the tallest it has been is a bar or a toolbar, not a keyboard. */
const KEYBOARD_PX = 120;

function raisesKeyboard(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return !target.readOnly;
  if (target instanceof HTMLInputElement) {
    return TYPED.has(target.type) && !target.readOnly;
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

let focused = $state(false);
let height = $state(0);
let tallest = 0;
let across = 0;

if (typeof window !== "undefined") {
  focused = raisesKeyboard(document.activeElement);
  on(window, "focusin", (event) => (focused = raisesKeyboard(event.target)));
  on(window, "focusout", () => (focused = false));

  const seen = window.visualViewport;
  if (seen !== null && seen !== undefined) {
    const measure = (): void => {
      // Turned, the tallest is the new orientation's to learn.
      if (window.innerWidth !== across) {
        across = window.innerWidth;
        tallest = 0;
      }
      tallest = Math.max(tallest, seen.height);
      height = seen.height;
    };
    measure();
    on(seen, "resize", measure);
  }
}

/**
 * Whether the keyboard is up on a phone: a field that raises it has the
 * focus, and the view is short of its tallest by about a keyboard. Android
 * puts the keyboard away without taking the focus, which the height sees.
 * Where the browser says nothing of the view, the focus alone answers.
 */
export const keyboard = {
  get up(): boolean {
    if (width.wide || !focused) return false;
    return height === 0 || height < tallest - KEYBOARD_PX;
  },
};
