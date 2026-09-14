/** Every sentence the shell says in its own voice. A capture's words are not here. */

export const NOTHING_CAPTURED = "Nothing captured yet.";

export const NO_MORE_OFFLINE = "offline; more when the daemon answers";

/** A link needs a label, and the address bar already carries the id. */
export const THIS_ITEM = "this item";

export const NO_ITEM_OFFLINE = "offline; this item when the daemon answers";

export const NO_RECORDS_OFFLINE = "offline; records when the daemon answers";

export const NO_SUCH_RECORD = `No such record.

This item has no record by that name. A decision that was cancelled or abandoned leaves none, nothing having happened to record.`;

export const NO_SUCH_ITEM = `No such item.

This pool has never held it, or does not hold it any more. A link outlives the item it names.`;

export const NOTHING_LOGGED = "Nothing has happened yet.";

export const NO_PREVIEW_OFFERED = "no preview for this destination";

export const PREVIEW_UNREACHABLE = "out of reach";

/** Followed by the media type it would have written. */
export const PREVIEW_NOT_TEXT =
  "This would not be text, so it cannot be shown here:";

export const NO_OUTPUT_KEPT = "This delivery kept no copy of what it sent.";

/** Drawn under the words themselves, where a record carries its own. */
export const WORDS_WERE_ITS_OWN =
  "This delivery carried these words rather than the item's. The item was not changed.";

/** A destination that handed nothing back to point at. Not a failure: some cannot. */
export const NO_POINTER_KEPT =
  "This destination named no place to go and look.";

/**
 * The same absence, where the destination was the person: nothing was asked of
 * anything, so nothing declined to answer.
 */
export const NO_POINTER_BY_HAND =
  "Done by hand, so there is nowhere here to go and look.";

export const OUTPUT_UNREADABLE = "What was sent could not be read.";
