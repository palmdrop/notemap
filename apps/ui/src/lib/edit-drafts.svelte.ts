import { untrack } from "svelte";

/**
 * What an edit holds that its item does not say yet, per item. The words go
 * to `localStorage` on the capture box's terms, so a draft survives leaving
 * the row and reloading the page, and is never sent until `save`. A picture
 * picked or dropped is held in memory only: it survives the row being left,
 * and not the page.
 */
const KEY = "notemap:edit-drafts";

/** A picture the draft carries in place of the item's, or `null` where it dropped it. */
export type HeldPicture = {
  readonly asset: string;
  readonly url: string;
  readonly name: string;
  readonly image: boolean;
} | null;

function read(): Record<string, string> {
  try {
    const held: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (typeof held !== "object" || held === null) return {};
    return Object.fromEntries(
      Object.entries(held).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

let words = $state<Record<string, string>>(read());
let pictures = $state<Record<string, HeldPicture>>({});

function persist(): void {
  try {
    if (Object.keys(words).length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(words));
  } catch {
    // A full or refused store is not a reason the field should fail to take a key.
  }
}

/** The words a draft holds for this item, where it holds any. */
export function draftWords(item: string): string | undefined {
  return words[item];
}

/** The picture a draft holds for this item: absent where it has not touched the item's. */
export function draftPicture(item: string): HeldPicture | undefined {
  return item in pictures ? pictures[item] : undefined;
}

/** Whether anything the item does not say is being held for it. */
export function drafted(item: string): boolean {
  return item in words || item in pictures;
}

/** Written from an effect, so what is already held is read without being tracked. */
export function keepDraft(
  item: string,
  draft: { words?: string; picture?: HeldPicture },
): void {
  untrack(() => {
    const { [item]: _words, ...otherWords } = words;
    words =
      draft.words === undefined
        ? otherWords
        : { ...words, [item]: draft.words };

    const { [item]: _picture, ...otherPictures } = pictures;
    pictures =
      draft.picture === undefined
        ? otherPictures
        : { ...pictures, [item]: draft.picture };

    persist();
  });
}

export function dropDraft(item: string): void {
  keepDraft(item, {});
}
