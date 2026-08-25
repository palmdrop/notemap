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
