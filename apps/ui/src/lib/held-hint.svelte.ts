const KEY = "notemap:held";

/** Whether a row has ever been held here, which the hint is said until. */
let known = $state(
  typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "yes",
);

export const heldHint = {
  get due(): boolean {
    return !known;
  },
};

/** A row was held: the hint has done its work. */
export function noteHeld(): void {
  known = true;
  localStorage.setItem(KEY, "yes");
}
