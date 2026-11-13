/**
 * The header's search line, asked for by `/` or the search icon: on a phone it
 * takes the header's place while it is open; when wide it is always there.
 */
let open = $state(false);
let asked = $state(0);

export const searching = {
  get open(): boolean {
    return open;
  },
  /** How many times the caret was asked for, which the line follows. */
  get asked(): number {
    return asked;
  },
  focus(): void {
    open = true;
    asked += 1;
  },
  close(): void {
    open = false;
  },
};
