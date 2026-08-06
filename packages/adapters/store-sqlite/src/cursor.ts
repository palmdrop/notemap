import type { FeedOrder, PageCursor } from "@notemap/core";

/**
 * Keyset, not offset: a cursor names the last row handed out, so a page cannot
 * skip or repeat a row because something was inserted behind it.
 *
 * It also carries the order it was issued for. A keyset only means anything in
 * one direction, so handing a newest-first cursor to an oldest-first read would
 * otherwise quietly return the wrong half of the feed.
 */
export type Keyset = {
  readonly at: number;
  readonly id: string;
};

const ORDERS: Record<FeedOrder, string> = {
  "newest-first": "n",
  "oldest-first": "o",
};

export function encodeCursor(keyset: Keyset, order: FeedOrder): PageCursor {
  return `${ORDERS[order]}:${keyset.at}:${keyset.id}` as PageCursor;
}

export function decodeCursor(cursor: PageCursor, order: FeedOrder): Keyset {
  const [tag, at, ...rest] = cursor.split(":");

  if (tag !== ORDERS[order]) {
    throw new TypeError(
      `cursor was issued for a different order than ${order}: ${cursor}`,
    );
  }

  const millis = Number(at);
  if (!Number.isInteger(millis) || rest.length === 0) {
    throw new TypeError(`not a cursor this store issued: ${cursor}`);
  }

  return { at: millis, id: rest.join(":") };
}
