import type { IconName } from "$components/primitives/icon/Icon.svelte";

/** One thing the selected rows can be given, drawn in the head when wide. */
export type BatchDeed = {
  readonly id: string;
  readonly icon: IconName;
  readonly label: string;
  readonly danger?: boolean;
  readonly primary?: boolean;
  readonly run: () => void;
};

/**
 * Rows selected for a batch take the head: how many, a way out, All, and
 * when wide what they can be given. Set while the list's bar is mounted.
 */
export type Selecting = {
  readonly count: number;
  /** As many as one batch takes: nothing more is selected. */
  readonly full: string | undefined;
  readonly all: () => void;
  readonly clear: () => void;
  readonly deeds: readonly BatchDeed[];
};

let current = $state.raw<Selecting | undefined>(undefined);

export const selecting = {
  get current(): Selecting | undefined {
    return current;
  },
};

/** Registers the selection for as long as the calling component lives. */
export function selects(read: () => Selecting | undefined): void {
  $effect(() => {
    const now = read();
    if (now === undefined) return;
    current = now;
    return () => {
      if (current === now) current = undefined;
    };
  });
}
