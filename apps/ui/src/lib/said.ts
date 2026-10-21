/** Every sentence the shell says in its own voice. A capture's words are not here. */

import type { Filter, FilterState } from "@notemap/client";

export const NOTHING_CAPTURED = "Nothing captured yet.";

export const NO_MORE_OFFLINE = "offline; more when the daemon answers";

export const NO_ITEM_OFFLINE = "offline; this item when the daemon answers";

export const NO_RECORDS_OFFLINE = "offline; records when the daemon answers";

export const NO_SUCH_RECORD = `No such record.

This item has no record by that name. A decision that was cancelled or abandoned leaves none, nothing having happened to record.`;

export const NO_SUCH_ITEM = `No such item.

This pool has never held it, or does not hold it any more. A link outlives the item it names.`;

export const NOTHING_LOGGED = "Nothing has happened yet.";

export const QUEUE_EMPTY = "Queue is empty.";

export const NOTHING_TO_CAPTURE = "nothing to capture";

export const NO_NOTICES = "No notices.";

export const CLEAR_FILTERS = "clear filters";

/** What became of an item, in this shell's words: archive is said as discard. */
export const STATE_WORD: Readonly<Record<FilterState, string>> = {
  unprocessed: "unprocessed",
  routed: "routed",
  archived: "discarded",
  revised: "revised",
};

/**
 * An emptied filter said as a sentence says it: any one of a band joined by
 * `or`, the bands and the tags joined as a list is.
 */
export function nothingMatches(
  filter: Filter,
  destinationName: (id: string) => string = (id) => id,
): string {
  const anyOf = (words: readonly string[]) => words.join(" or ");
  const bands = [
    anyOf(filter.states.map((state) => STATE_WORD[state])),
    anyOf(filter.destinations.map((id) => `to ${destinationName(id)}`)),
    anyOf(filter.sources.map((source) => `from ${source}`)),
  ].filter((band) => band !== "");
  const names = [...bands, ...filter.tags];

  const which =
    names.length === 1 || bands.length > 0
      ? everyOf(names)
      : `${names.length === 2 ? "both" : "all of"} ${everyOf(names)}`;
  return `Nothing matches ${which}.`;
}

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

/** A mark made by hand and taken back, in the log's block. */
export const UNDONE = "undone";

/** A delivery that kept no copy of what it sent: ordinary, and said in two words. */
export const NOTHING_KEPT = "nothing kept";

/** Beside the asking mark, once a destination has kept the shell waiting a while. */
export function slowToAnswer(subject: string): string {
  return `${subject} is slow to answer`;
}

/** What a reader that cannot see the asking mark is told instead. */
export const ASKING = "loading";

/** Every one of several, as a sentence says it: `a`, `a and b`, `a, b and c`. */
export function everyOf(names: readonly string[]): string {
  const last = names.at(-1);
  if (last === undefined) return "";
  return names.length === 1
    ? last
    : `${names.slice(0, -1).join(", ")} and ${last}`;
}
