/**
 * The quick route, open for one item: the sheet a row's Route, a swipe, the
 * item's Route and `p` all open, drawn once by the frame.
 */
let open = $state<string | undefined>(undefined);

export const quick = {
  /** The item it is open for. */
  get item(): string | undefined {
    return open;
  },
  open(item: string): void {
    open = item;
  },
  close(): void {
    open = undefined;
  },
};
