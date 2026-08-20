/**
 * Which item has a routing composer open. Shell view state, not the domain's:
 * a composer is the one thing that widens the page, and the frame is drawn a
 * level above the surface that opens it.
 */
let item = $state<string | undefined>(undefined);

export const composing = {
  get item() {
    return item;
  },
  get open() {
    return item !== undefined;
  },
  begin(id: string) {
    item = id;
  },
  end() {
    item = undefined;
  },
};
