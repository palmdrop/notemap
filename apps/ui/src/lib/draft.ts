/**
 * What the capture box holds before its capture commits. The words and the
 * tags go to `localStorage` on the same terms as the order and the theme —
 * small, string-shaped, and losing it costs retyping. One draft per origin, so
 * two tabs share it and the last write wins. The picture is held in memory
 * only: it survives the box being drawn again, and not the page.
 */
export type Draft = {
  readonly text: string;
  readonly tags: readonly string[];
};

const KEY = "notemap:draft";

export const EMPTY: Draft = { text: "", tags: [] };

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
    return shaped(held) ? held : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function writeDraft(draft: Draft): void {
  try {
    if (draft.text === "" && draft.tags.length === 0) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // A full or refused store is not a reason the box should fail to take a key.
  }
}

let picture: File | undefined;

export function heldPicture(): File | undefined {
  return picture;
}

export function holdPicture(file: File | undefined): void {
  picture = file;
}

export function clearDraft(): void {
  writeDraft(EMPTY);
  picture = undefined;
}
