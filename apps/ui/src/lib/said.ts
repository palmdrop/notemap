/** Every sentence the shell says in its own voice. A capture's words are not here. */

export const NOTHING_CAPTURED = "Nothing captured yet.";

export const NO_MORE_OFFLINE = "offline; more when the daemon answers";

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

export const OUTPUT_UNREADABLE = "What was sent could not be read.";

/** The destination of a decision made by hand, in the block's head. */
export const BY_HAND = "by hand";

export const NOT_YET_DELIVERED = "not yet delivered";

/** A reservation cancelled before its delivery landed, in the log's block. */
export const CALLED_OFF = "called off";

/** A delivery that kept no copy of what it sent: ordinary, and said in two words. */
export const NOTHING_KEPT = "nothing kept";
