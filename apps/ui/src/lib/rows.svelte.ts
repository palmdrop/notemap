import { on } from "svelte/events";
import { createSubscriber } from "svelte/reactivity";

import { narrow } from "./breakpoint";

/**
 * How a register draws its rows. `by day` heads each day and keeps only the
 * time on the row; `rail` is the stamp and tags beside every row; `auto` is by
 * day where the rail would crowd a narrow screen, and the rail elsewhere.
 */
export type Rows = "auto" | "by day" | "rail";

export const ROWS: readonly Rows[] = ["auto", "by day", "rail"];

/**
 * The choice settled against the width. `slim` is by day on a narrow screen,
 * where the rail holds the time and nothing else.
 */
export type Layout = "rail" | "by day" | "slim";

const KEY = "notemap:rows";

function held(): Rows {
  const said = localStorage.getItem(KEY);
  return ROWS.includes(said as Rows) ? (said as Rows) : "auto";
}

let choice = $state<Rows>(held());

const crossed = createSubscriber((update) => {
  let was = narrow();
  return on(window, "resize", () => {
    if (narrow() === was) return;
    was = !was;
    update();
  });
});

function isNarrow(): boolean {
  crossed();
  return narrow();
}

export const rows = {
  get choice(): Rows {
    return choice;
  },

  choose(wanted: Rows): void {
    choice = wanted;
    localStorage.setItem(KEY, wanted);
  },

  get drawn(): Layout {
    if (choice === "rail") return "rail";
    if (isNarrow()) return "slim";
    return choice === "by day" ? "by day" : "rail";
  },

  /** Whether a register heads each day and keeps only the time on the row. */
  get byDay(): boolean {
    return this.drawn !== "rail";
  },

  get slim(): boolean {
    return this.drawn === "slim";
  },
};

/** For tests, which would otherwise carry one case's choice into the next. */
export function forgetRows(): void {
  choice = held();
}
