/**
 * Which palette the shell wears. `auto` is the browser's own answer, which is
 * the only one that can be right before a person has said anything.
 *
 * Nothing here names a colour: `light-dark()` in `tokens.css` resolves against
 * the used `color-scheme`, so setting that one property turns every role over.
 */
export type Theme = "auto" | "light" | "dark";

export const THEMES: readonly Theme[] = ["auto", "light", "dark"];

const KEY = "notemap:theme";

function held(): Theme {
  const said = localStorage.getItem(KEY);
  return THEMES.includes(said as Theme) ? (said as Theme) : "auto";
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

  choose(wanted: Theme) {
    choice = wanted;
    localStorage.setItem(KEY, choice);
    apply(choice);
  },
};
