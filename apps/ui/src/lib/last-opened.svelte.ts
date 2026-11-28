/**
 * The item last opened from a list, which that list draws marked when it is
 * come back to: the reader's place, without a selection or its strip.
 */
let last = $state<string | undefined>(undefined);

export const lastOpened = {
  get id(): string | undefined {
    return last;
  },
  set(id: string): void {
    last = id;
  },
  /** A row taken since is the reader's place instead. */
  clear(): void {
    last = undefined;
  },
};
