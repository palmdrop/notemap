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

const KEY = "notemap:rows";

function held(): Rows {
  const said = localStorage.getItem(KEY);
  return ROWS.includes(said as Rows) ? (said as Rows) : "auto";
}

/** Storage holds the choice; this only tells a reader that it changed. */
let chosen = $state(0);

const resized = createSubscriber((update) => on(window, "resize", update));

function isNarrow(): boolean {
  resized();
  return narrow();
}

export const rows = {
  get choice(): Rows {
    void chosen;
    return held();
  },

  choose(wanted: Rows): void {
    localStorage.setItem(KEY, wanted);
    chosen += 1;
  },

  /** Whether a register heads each day and keeps only the time on the row. */
  get byDay(): boolean {
    const choice = this.choice;
    return choice === "by day" || (choice === "auto" && isNarrow());
  },

  /** By day on a narrow screen, the rail holds the time and nothing else. */
  get slim(): boolean {
    return this.byDay && isNarrow();
  },
};
