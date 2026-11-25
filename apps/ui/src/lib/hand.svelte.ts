/** Which hand holds the phone: the + stands at the foot on that side. */
export type Hand = "right" | "left";

export const HANDS: readonly Hand[] = ["right", "left"];

const KEY = "notemap:hand";

function held(): Hand {
  return localStorage.getItem(KEY) === "left" ? "left" : "right";
}

let choice = $state<Hand>(held());

export const hand = {
  get choice(): Hand {
    return choice;
  },

  choose(wanted: Hand): void {
    choice = wanted;
    localStorage.setItem(KEY, choice);
  },
};
