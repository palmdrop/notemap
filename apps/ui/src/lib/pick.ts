const CONTROLS =
  "a, button, input, textarea, select, label, [role='button'], [role='option']";

/** A click on a control inside the cell is that control's, not the row's. */
function inside(event: MouseEvent): boolean {
  const from = event.target;
  return from instanceof Element && from.closest(CONTROLS) !== null;
}

/**
 * Opening is a toggle, so the second click of a double would shut the row again
 * on its way to the item's own surface. A click carries how many of them it is,
 * and only the first is one.
 */
export function pickable(onpick: () => void) {
  return (event: MouseEvent) => {
    if (inside(event) || event.detail > 1) return;
    onpick();
  };
}

/** Whether the double the browser just handled took a word out of the page. */
function selecting(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
}

/**
 * The gesture that leaves the surface rather than opening in place — except
 * where the browser has already spent it: a double click on prose selects the
 * word under it, which is what a person reaching for a capture's text is doing,
 * and navigating out from under a selection they just made is not that.
 */
export function doubled(ondouble: () => void) {
  return (event: MouseEvent) => {
    if (inside(event) || selecting()) return;
    ondouble();
  };
}

/**
 * A row taken on `mousedown` has spent the press. The `click` it ends in is
 * sent wherever the pointer is let go — the row beneath, once the one taken
 * has gone — and reaches nothing. A press let go outside the page sends no
 * `mouseup`, so the next press, not a later click, is what forgets it.
 */
export function spendPress(): void {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
  };
  const released = () => {
    window.removeEventListener("mousedown", forget, true);
    window.addEventListener("click", swallow, { capture: true, once: true });
    // The click is sent in the same task as the release, or not at all.
    setTimeout(() => {
      window.removeEventListener("click", swallow, true);
    });
  };
  const forget = () => {
    window.removeEventListener("mouseup", released, true);
  };
  window.addEventListener("mouseup", released, { capture: true, once: true });
  window.addEventListener("mousedown", forget, { capture: true, once: true });
}
