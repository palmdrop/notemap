const CONTROLS = "a, button, input, textarea, select, label, [role='button']";

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
