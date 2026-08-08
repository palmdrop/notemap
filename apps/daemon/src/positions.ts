import type { FeedOrder, Position, Timestamp } from "@notemap/core";

export const FEED_ORDERS: readonly FeedOrder[] = [
  "newest-first",
  "oldest-first",
];

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

/**
 * `<at>,<id>`, or a bare `<at>` as a coarse entry point.
 *
 * Split on the **first** comma only: an id is an arbitrary string and may
 * contain one, while an RFC 3339 timestamp may not.
 */
export function parsePosition(raw: string): Position | undefined {
  const comma = raw.indexOf(",");
  const at = comma === -1 ? raw : raw.slice(0, comma);
  const id = comma === -1 ? undefined : raw.slice(comma + 1);

  if (at === "" || Number.isNaN(Date.parse(at))) return undefined;
  if (id === "") return undefined;

  return { at: at as Timestamp, ...(id === undefined ? {} : { id }) };
}

export function formatPosition(position: Position): string {
  return position.id === undefined
    ? position.at
    : `${position.at},${position.id}`;
}

/**
 * A ready-to-fetch relative URL, so a client pages by following a link rather
 * than by reassembling a query whose parameters it has to have kept.
 */
export function feedUrl(
  order: FeedOrder,
  limit: number,
  after: Position,
): string {
  const query = new URLSearchParams({
    order,
    limit: String(limit),
    after: formatPosition(after),
  });
  return `/v1/feed?${query.toString()}`;
}
