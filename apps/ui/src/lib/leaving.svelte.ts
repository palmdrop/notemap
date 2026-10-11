import { tick } from "svelte";

/**
 * The one edit open at a time, and the question asked of anybody leaving it
 * with changes. Every way out of an edit — closing it, another row, the
 * capture box, another page — goes through `leave`, which goes on at once
 * where nothing would be lost and asks otherwise: save, revert, or stay.
 */
export type Open = {
  /** Which capture it is, for a question asked wherever the row has scrolled to. */
  readonly about: string;
  readonly changed: () => boolean;
  /**
   * Attaches what the edit holds and sends it, answering whether it saved. A
   * `false` is an edit still open holding the words, having said why.
   */
  readonly save: () => Promise<boolean>;
  /** Lets the changes go and closes the edit. */
  readonly revert: () => void;
  /** Back into the field, the row brought into view. */
  readonly resume: () => void;
};

let open: Open | undefined;
let asking = $state.raw<
  { readonly edit: Open; readonly then: () => void } | undefined
>(undefined);

/**
 * Between an answer and what it goes on to: closing the dialog hands the focus
 * back to wherever it was, and a focus landing back in the capture box is not
 * somebody leaving the edit again.
 */
let settling = false;

/** Holds the edit as the open one until the returned function lets it go. */
export function opened(edit: Open): () => void {
  open = edit;
  return () => {
    if (open !== edit) return;
    open = undefined;
    if (asking?.edit === edit) asking = undefined;
  };
}

/** Whether leaving now would lose something. */
export function unsaved(): boolean {
  return open?.changed() ?? false;
}

export function leave(then: () => void): void {
  if (asking !== undefined || settling) return;
  if (open === undefined || !open.changed()) {
    then();
    return;
  }
  asking = { edit: open, then };
}

export const question = {
  /** The edit being asked about, which is the one that draws the question. */
  get about(): Open | undefined {
    return asking?.edit;
  },
};

export async function answer(
  choice: "save" | "revert" | "stay",
): Promise<void> {
  const pending = asking;
  if (pending === undefined) return;
  const { edit, then } = pending;

  settling = true;
  asking = undefined;
  try {
    // The dialog closes first: nothing behind a modal can take the focus.
    await tick();

    if (choice === "stay") {
      edit.resume();
      return;
    }

    if (choice === "save") {
      // An edit that could not be saved is not left behind: going on would
      // take the words with it, and the notice naming the file is not an
      // answer to what was asked here.
      if (!(await edit.save())) {
        edit.resume();
        return;
      }
    } else {
      edit.revert();
    }

    if (open === edit) open = undefined;
    then();
  } finally {
    settling = false;
  }
}
