let keys = $state(false);
let watching = false;

/**
 * Whether the last thing the person did was a key rather than the pointer:
 * a mark that only the keys need — where they are while rows are selected —
 * is drawn then, and not after a click, where the tint says enough.
 */
export const modality = {
  get keys(): boolean {
    if (!watching && typeof window !== "undefined") {
      watching = true;
      window.addEventListener("keydown", () => (keys = true), true);
      window.addEventListener("pointerdown", () => (keys = false), true);
    }
    return keys;
  },
};
