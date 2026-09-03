const DAY = 86_400_000;
/** Days apart at their own midnights, so a change of offset between them cannot round one out. */

/**
 * How long ago, as one word or two. Coarse on purpose: this sits beside a count
 * in a completion list, where *roughly when* is the whole question and a
 * timestamp would be a second thing to read. Anything older than a year is the
 * year, since by then the month has stopped meaning anything either.
 */
export function whenOf(at: string, now: number): string {
  const then = Date.parse(at);
  if (Number.isNaN(then)) return "";

  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY);

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  if (days < 365) return `${Math.floor(days / 30)} months`;
  return new Date(then).getFullYear().toString();
}

/**
 * The reader's own midnight, not the epoch's: `today` and `yesterday` are the
 * two words this answers that a person checks against their own clock, and a
 * UTC boundary makes them wrong for most of the evening east of Greenwich.
 */
function startOfDay(millis: number): number {
  const when = new Date(millis);
  when.setHours(0, 0, 0, 0);
  return when.getTime();
}
