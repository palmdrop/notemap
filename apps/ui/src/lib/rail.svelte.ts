/**
 * Whether the metadata rail is furled away. A reading preference rather than
 * anything about the pool, so it is the reader's and it is remembered.
 */
const KEY = "notemap:rail";

let furled = $state(localStorage.getItem(KEY) === "furled");

export const rail = {
  get furled() {
    return furled;
  },

  toggle() {
    furled = !furled;
    localStorage.setItem(KEY, furled ? "furled" : "open");
  },
};
