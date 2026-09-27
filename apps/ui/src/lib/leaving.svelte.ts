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
  readonly save: () => void;
  /** Lets the changes go and closes the edit. */
  readonly revert: () => void;
  /** Back into the field, the row brought into view. */
  readonly resume: () => void;
};

let open: Open | undefined;
let asking = $state<
  { readonly then: () => void; readonly about: string } | undefined
>(undefined);

/** Holds the edit as the open one until the returned function lets it go. */
export function opened(edit: Open): () => void {
  open = edit;
  return () => {
    if (open !== edit) return;
    open = undefined;
    asking = undefined;
  };
}

/** Whether leaving now would lose something. */
export function unsaved(): boolean {
  return open?.changed() ?? false;
}

export function leave(then: () => void): void {
  if (asking !== undefined) return;
  if (!unsaved()) {
    then();
    return;
  }
  asking = { then, about: open?.about ?? "" };
}

export const question = {
  get asked(): boolean {
    return asking !== undefined;
  },
  get about(): string {
    return asking?.about ?? "";
  },
};

export function answer(choice: "save" | "revert" | "stay"): void {
  const pending = asking;
  const edit = open;
  asking = undefined;
  if (pending === undefined || edit === undefined) return;

  if (choice === "stay") {
    edit.resume();
    return;
  }

  // Let go before going on: what follows may be another leave, and the edit
  // being closed still holds its changes until its row redraws.
  open = undefined;
  if (choice === "save") edit.save();
  else edit.revert();
  pending.then();
}
