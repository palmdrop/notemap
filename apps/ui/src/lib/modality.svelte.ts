let keys = $state(false);

// Listening from the start, so the key that opens something is already seen
// by the time that something asks which way it was opened.
if (typeof window !== "undefined") {
  window.addEventListener("keydown", () => (keys = true), true);
  window.addEventListener("pointerdown", () => (keys = false), true);
}

/**
 * Whether the last thing the person did was a key rather than the pointer:
 * a mark that only the keys need — where they are while rows are selected —
 * is drawn then, and not after a click, where the tint says enough.
 */
export const modality = {
  get keys(): boolean {
    return keys;
  },
};
