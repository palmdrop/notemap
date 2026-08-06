import type { PageCursor } from "@notemap/core";

/**
 * Keyset, not offset: a cursor names the last row handed out, so a page cannot
 * skip or repeat a row because something was inserted behind it.
 *
 * It also carries which read it was issued for — surface and order both. A
 * keyset only means anything against the query that produced it, so handing a
 * feed cursor to the action log, or a newest-first cursor to an oldest-first
 * read, would otherwise quietly filter on the wrong rows.
 */
export type Keyset = {
  readonly at: number;
  readonly id: string;
};

export type CursorSpace =
  | "feed:newest-first"
  | "feed:oldest-first"
  | "actions";

const TAGS: Record<CursorSpace, string> = {
  "feed:newest-first": "fn",
  "feed:oldest-first": "fo",
  actions: "a",
};

export function encodeCursor(keyset: Keyset, space: CursorSpace): PageCursor {
  return `${TAGS[space]}:${keyset.at}:${keyset.id}` as PageCursor;
}

export function decodeCursor(cursor: PageCursor, space: CursorSpace): Keyset {
  const [tag, at, ...rest] = cursor.split(":");

  if (tag !== TAGS[space]) {
    throw new TypeError(
      `cursor was issued for a different read than ${space}: ${cursor}`,
    );
  }

  if (at === undefined || !/^\d+$/.test(at) || rest.length === 0) {
    throw new TypeError(`not a cursor this store issued: ${cursor}`);
  }

  return { at: Number(at), id: rest.join(":") };
}
