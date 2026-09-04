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

/** The gesture that leaves the surface rather than opening in place. */
export function doubled(ondouble: () => void) {
  return (event: MouseEvent) => {
    if (inside(event)) return;
    ondouble();
  };
}
