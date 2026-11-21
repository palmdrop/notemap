let moved = false;

/**
 * Whether this page was reached by moving within the shell rather than opened
 * at its address, so going back stays in the shell.
 */
export const within = {
  get yes(): boolean {
    return moved;
  },
  note(): void {
    moved = true;
  },
};
