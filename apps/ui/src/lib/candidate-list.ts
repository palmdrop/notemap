import type { CandidateEntry } from "@notemap/client";

/**
 * A flat answer, narrowed and completed as it is typed into. The hierarchical
 * one is `path-line`'s: there a level is filtered by the segment being typed,
 * here the whole field is the filter, because there are no segments.
 */

/**
 * What taking this entry leaves in the field. An entry that is only somewhere
 * to look has no value, and its label is the most a completion can offer —
 * enough to narrow the list to it and descend.
 */
export function takenAs(entry: CandidateEntry): string {
  return entry.value === undefined ? entry.label : String(entry.value);
}

/**
 * By prefix and case-insensitively, over **both** the label a person reads and
 * the value the field holds. Both, because the two need not be the same string:
 * an are.na channel is browsed by its title and filed under its slug, so
 * matching the label alone would empty the list the moment `⇥` resolved one to
 * the other.
 */
export function narrowed(
  entries: readonly CandidateEntry[],
  typing: string,
): readonly CandidateEntry[] {
  const wanted = typing.trim().toLowerCase();
  if (wanted === "") return entries;

  return entries.filter(
    (entry) =>
      entry.label.toLowerCase().startsWith(wanted) ||
      takenAs(entry).toLowerCase().startsWith(wanted),
  );
}

/**
 * What `⇥` leaves. One match completes to **the value**, which is the point of
 * the key here: typing a channel's title and pressing it leaves the slug the
 * field will actually be sent with, rather than the title it was found by.
 *
 * Several complete only as far as they agree, and only where what they agree on
 * continues what was typed — a shared prefix that does not would replace a
 * person's own text with something they did not write.
 */
export function completed(
  entries: readonly CandidateEntry[],
  typing: string,
): string | undefined {
  const hits = narrowed(entries, typing);
  if (hits.length === 0) return undefined;

  if (hits.length === 1) {
    const only = takenAs(hits[0] as CandidateEntry);
    return only === typing ? undefined : only;
  }

  const shared = commonPrefix(hits.map(takenAs));
  return shared.length > typing.length &&
    shared.toLowerCase().startsWith(typing.toLowerCase())
    ? shared
    : undefined;
}

/** The longest head every one of them agrees on, compared without case. */
export function commonPrefix(values: readonly string[]): string {
  const [first = "", ...rest] = values;

  let length = first.length;
  for (const value of rest) {
    while (
      length > 0 &&
      value.slice(0, length).toLowerCase() !==
        first.slice(0, length).toLowerCase()
    ) {
      length -= 1;
    }
  }

  return first.slice(0, length);
}
