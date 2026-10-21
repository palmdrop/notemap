import { dayOf } from "./stamp";

/** A heading over the first of a day's rows, or one of the rows it heads. */
export type Drawn<T> =
  | { readonly kind: "day"; readonly key: string; readonly at: string }
  | {
      readonly kind: "row";
      readonly key: string;
      readonly row: T;
      /** The first row under its heading, whose top edge lies on the heading's rule. */
      readonly opens: boolean;
    };

/**
 * A register's rows with a heading before the first of each local day, in the
 * order they are read. A heading is keyed by its day, so it stays put while
 * the rows under it come and go. `dayAt` is the instant a row is headed by,
 * the one its list is ordered on.
 */
export function byDay<
  T extends { readonly id: string; readonly createdAt: string },
>(
  rows: readonly T[],
  dayAt: (row: T) => string = (row) => row.createdAt,
): readonly Drawn<T>[] {
  const drawn: Drawn<T>[] = [];
  const seen = new Map<string, number>();
  let current: string | undefined;

  for (const row of rows) {
    const day = dayOf(dayAt(row));
    const opens = day !== current;
    if (opens) {
      // A day read twice, out of order, still needs a key of its own.
      const times = seen.get(day) ?? 0;
      seen.set(day, times + 1);
      drawn.push({
        kind: "day",
        key: times === 0 ? `day:${day}` : `day:${day}:${times}`,
        at: dayAt(row),
      });
      current = day;
    }
    drawn.push({ kind: "row", key: row.id, row, opens });
  }

  return drawn;
}

/** What a list read by this key is headed by: the day each row was processed, read by it. */
export function dayAtFor(
  by: "capture" | "processed",
): (row: {
  readonly createdAt: string;
  readonly processedAt: string;
}) => string {
  return by === "processed" ? (row) => row.processedAt : (row) => row.createdAt;
}

/** The same rows with no headings, for a register drawn on the rail. */
export function plain<T extends { readonly id: string }>(
  rows: readonly T[],
): readonly Drawn<T>[] {
  return rows.map((row) => ({ kind: "row", key: row.id, row, opens: false }));
}
