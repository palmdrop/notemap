/**
 * What the capture box holds before its capture commits: the words and the
 * tags, and not the picture. `localStorage` on the same terms as the order and
 * the theme — small, string-shaped, and losing it costs retyping. One draft
 * per origin, so two tabs share it and the last write wins.
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

export function clearDraft(): void {
  writeDraft(EMPTY);
}
