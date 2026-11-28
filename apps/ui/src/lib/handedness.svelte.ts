/** Which hand holds the phone: the + stands at the foot on that side. */
export type Handedness = "right" | "left";

export const SIDES: readonly Handedness[] = ["right", "left"];

const KEY = "notemap:hand";

function held(): Handedness {
  return localStorage.getItem(KEY) === "left" ? "left" : "right";
}

let choice = $state<Handedness>(held());

export const handedness = {
  get choice(): Handedness {
    return choice;
  },

  choose(wanted: Handedness): void {
    choice = wanted;
    localStorage.setItem(KEY, choice);
  },
};
