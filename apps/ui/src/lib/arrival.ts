import type { NavigationType } from "@sveltejs/kit";

let last: NavigationType = "enter";

/** Said by the layout of every move within the shell, before the page it lands on is drawn. */
export function arriving(type: NavigationType): void {
  last = type;
}

/** Whether the page being drawn was come back to by back or forward, rather than come to. */
export function cameBack(): boolean {
  return last === "popstate";
}
