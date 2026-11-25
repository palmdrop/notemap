/** The panel's id, which the line's and the header's toggles name as what they control. */
export const PANEL = "status-panel";

let open = $state(false);

/** Whether the notices are open: from the line, from the bell, or by `n`. */
export const panel = {
  get open(): boolean {
    return open;
  },
  toggle(): void {
    open = !open;
  },
  close(): void {
    open = false;
  },
};
