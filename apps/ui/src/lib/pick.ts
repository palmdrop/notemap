/** What a cell holds that is worth clicking for its own sake. */
const CONTROLS = "a, button, input, textarea, select, label, [role='button']";

/**
 * A whole cell opens the row it belongs to, which is the reach a rail carrying
 * tags and a body carrying prose both want. A tag, an action or a field inside
 * one is not that click, so it does not become one.
 */
export function pickable(onpick: () => void) {
  return (event: MouseEvent) => {
    const from = event.target;
    if (from instanceof Element && from.closest(CONTROLS) !== null) return;
    onpick();
  };
}
