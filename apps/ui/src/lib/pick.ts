const CONTROLS = "a, button, input, textarea, select, label, [role='button']";

/** A click on a control inside the cell is that control's, not the row's. */
export function pickable(onpick: () => void) {
  return (event: MouseEvent) => {
    const from = event.target;
    if (from instanceof Element && from.closest(CONTROLS) !== null) return;
    onpick();
  };
}
