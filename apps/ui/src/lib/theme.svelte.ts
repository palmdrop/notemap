/**
 * Which palette the shell wears. `auto` is the browser's own answer, which is
 * the only one that can be right before a person has said anything.
 *
 * Nothing here names a colour: `light-dark()` in `layout.css` resolves against
 * the used `color-scheme`, so setting that one property turns every role over.
 */
export type Theme = "auto" | "light" | "dark";

const KEY = "notemap:theme";
const CYCLE: readonly Theme[] = ["auto", "light", "dark"];

function held(): Theme {
  const said = localStorage.getItem(KEY);
  return CYCLE.includes(said as Theme) ? (said as Theme) : "auto";
}

let choice = $state<Theme>(held());

function apply(wanted: Theme): void {
  const root = document.documentElement;
  if (wanted === "auto") delete root.dataset["theme"];
  else root.dataset["theme"] = wanted;
}

export const theme = {
  get choice() {
    return choice;
  },

  /** One control, so it cycles rather than opening a menu over three words. */
  next() {
    choice = CYCLE[(CYCLE.indexOf(choice) + 1) % CYCLE.length] as Theme;
    localStorage.setItem(KEY, choice);
    apply(choice);
  },
};
