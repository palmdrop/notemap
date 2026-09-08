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
 *
 * `durable` asks for the form that survives a rename, where the destination
 * offered one: a decision that fires again — a routing template, sitting on a
 * tag for months — takes that, and a decision made once takes the readable
 * form. Which of the two is wanted is the surface's business, not the
 * destination's, so both travel and the caller picks.
 */
export function takenAs(entry: CandidateEntry, durable = false): string {
  const wanted = durable ? (entry.durable ?? entry.value) : entry.value;
  return wanted === undefined ? entry.label : String(wanted);
}

/** Every string that names this entry, so a field holding any of them is matched. */
function namesOf(entry: CandidateEntry): readonly string[] {
  return [
    entry.label,
    ...(entry.value === undefined ? [] : [String(entry.value)]),
    ...(entry.durable === undefined ? [] : [String(entry.durable)]),
  ];
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

  return entries.filter((entry) =>
    namesOf(entry).some((name) => name.toLowerCase().startsWith(wanted)),
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
  durable = false,
): string | undefined {
  const hits = narrowed(entries, typing);
  if (hits.length === 0) return undefined;

  if (hits.length === 1) {
    const only = takenAs(hits[0] as CandidateEntry, durable);
    return only === typing ? undefined : only;
  }

  const shared = commonPrefix(hits.map((entry) => takenAs(entry, durable)));
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

/**
 * What a typed line *means*, resolved against what the destination offered. A
 * person reads a list of titles and types one; the field is sent with the
 * value, and the two need not be the same string.
 *
 * Two ways in, and both are unambiguous: the whole of a title, or enough of one
 * that only a single answer still matches. The second is what `⇥` does, and it
 * is safe **here** for the reason it is not safe on a keystroke — this runs
 * when the line is done being typed, so there is no half-written word left to
 * take out of somebody's mouth.
 *
 * Anything unresolved is left exactly as written: an answer is one page of what
 * a destination holds, and a group channel or a numeric ID is not in it.
 */
export function resolved(
  entries: readonly CandidateEntry[],
  typing: string,
  durable = false,
): string | undefined {
  const wanted = typing.trim().toLowerCase();
  if (wanted === "") return undefined;

  // Already the form this surface wants: nothing to resolve, whatever else
  // names the same entry.
  if (
    entries.some((entry) => takenAs(entry, durable).toLowerCase() === wanted)
  ) {
    return undefined;
  }

  const named = entries.filter(
    (entry) => entry.label.trim().toLowerCase() === wanted,
  );
  const only = named.length === 1 ? named[0] : soleMatch(entries, typing);
  if (only === undefined) return undefined;

  const taken = takenAs(only, durable);
  return taken === typing ? undefined : taken;
}

/** The one answer still matching what was typed, where exactly one is. */
function soleMatch(
  entries: readonly CandidateEntry[],
  typing: string,
): CandidateEntry | undefined {
  const hits = narrowed(entries, typing);
  return hits.length === 1 ? hits[0] : undefined;
}
