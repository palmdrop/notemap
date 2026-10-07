/**
 * What the capture box holds before its capture commits. The words and the
 * tags go to `localStorage` on the same terms as the order and the theme —
 * small, string-shaped, and losing it costs retyping. One draft per origin, so
 * two tabs share it and the last write wins. The attachments are held in
 * memory only: they survive the box being drawn again, and not the page.
 */
export type Draft = {
  readonly text: string;
  readonly tags: readonly string[];
};

const KEY = "notemap:draft";

const EMPTY: Draft = { text: "", tags: [] };

function shaped(held: unknown): held is Draft {
  return (
    typeof held === "object" &&
    held !== null &&
    typeof (held as Draft).text === "string" &&
    Array.isArray((held as Draft).tags) &&
    (held as Draft).tags.every((tag) => typeof tag === "string")
  );
}

/** What was last written, or nothing where there is none or it cannot be read. */
export function readDraft(): Draft {
  try {
    const held: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!shaped(held)) return EMPTY;
    // A name twice is a key twice to the chooser this restores into, and only
    // a hand-edited store can hold one.
    return { text: held.text, tags: [...new Set(held.tags)] };
  } catch {
    return EMPTY;
  }
}

export function writeDraft(draft: Draft): void {
  try {
    // Whitespace is nothing to come back to, and nothing `capture` would take.
    if (draft.text.trim() === "" && draft.tags.length === 0) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // A full or refused store is not a reason the box should fail to take a key.
  }
}

let files: readonly File[] = [];

export function heldFiles(): readonly File[] {
  return files;
}

export function holdFiles(held: readonly File[]): void {
  files = held;
}

export function clearDraft(): void {
  writeDraft(EMPTY);
  files = [];
}

/** Where the box puts a capture back, of the ways it can fail to. */
export type Restored = "restored" | "unwritable";

const listeners = new Set<() => void>();

/** Tells a box already drawn that its draft was added to from elsewhere. */
export function onRestored(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Puts a capture back into the box after whatever the box already holds: its
 * words after the box's, its tags beside the box's, its attachments after the
 * box's. Read back before it answers, since a store that refused the write
 * would leave the words nowhere.
 */
export function restoreDraft(
  draft: Draft,
  restored: readonly File[] = [],
): Restored {
  const current = readDraft();
  const text =
    current.text.trim() === ""
      ? draft.text
      : draft.text.trim() === ""
        ? current.text
        : `${current.text}\n\n${draft.text}`;
  const tags = [...new Set([...current.tags, ...draft.tags])];

  writeDraft({ text, tags });
  if (text.trim() !== "" && readDraft().text !== text) return "unwritable";

  files = [...files, ...restored];
  for (const listener of listeners) listener();
  return "restored";
}
