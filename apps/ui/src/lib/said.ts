/** Every sentence the shell says in its own voice. A capture's words are not here. */

export const NOTHING_CAPTURED = "Nothing captured yet.";

export const DRAINED = `The queue is empty.

Everything captured has been routed, marked done, or archived. Anything new goes in at the top.`;

export const NO_MORE_OFFLINE = "offline; more when the daemon answers";

/** A link needs a label, and the address bar already carries the id. */
export const THIS_ITEM = "this item";

export const NO_ITEM_OFFLINE = "offline; this item when the daemon answers";

export const NO_RECORDS_OFFLINE = "offline; records when the daemon answers";

export const NO_SUCH_RECORD = `No such record.

This item has no record by that name. A decision that was cancelled or abandoned leaves none, nothing having happened to record.`;

export const NO_SUCH_ITEM = `No such item.

This pool has never held it, or does not hold it any more. A link outlives the item it names.`;

export const LOG_LEDE =
  "Everything this pool has done, in the order it happened.";

export const NOTHING_LOGGED = "Nothing has happened yet.";

/**
 * What a preview is, said where it is drawn: a person about to commit needs to
 * know this is what the destination would write now rather than a promise.
 */
export const PREVIEW_IS_INDICATIVE =
  "What this destination would write now. The delivery converts again when it runs.";

export const NO_PREVIEW_OFFERED =
  "This destination cannot show what it would write.";

export const PREVIEW_UNREACHABLE =
  "The destination could not be reached to show this. Routing to it still works.";

export const NO_OUTPUT_KEPT = "This delivery kept no copy of what it sent.";

export const OUTPUT_UNREADABLE = "What was sent could not be read.";
