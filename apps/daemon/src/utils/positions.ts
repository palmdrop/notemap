import type { Position, ReadOrder } from "@notemap/core";

import { instant, toTimestamp } from "../schemas/timestamp";

/**
 * `<at>,<id>`, or a bare `<at>` as a coarse entry point. Split on the first
 * comma only: an id may contain one, an ISO 8601 instant may not.
 */
export function parsePosition(raw: string): Position | undefined {
  const comma = raw.indexOf(",");
  const at = comma === -1 ? raw : raw.slice(0, comma);
  const id = comma === -1 ? undefined : raw.slice(comma + 1);

  if (id === "") return undefined;
  if (!instant.safeParse(at).success) return undefined;

  return { at: toTimestamp(at), ...(id === undefined ? {} : { id }) };
}

export function formatPosition(position: Position): string {
  return position.id === undefined
    ? position.at
    : `${position.at},${position.id}`;
}

export function feedUrl(
  order: ReadOrder,
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
