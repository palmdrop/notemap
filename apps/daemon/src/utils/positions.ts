import type { Position } from "@notemap/core";

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

/** A parameter given several values is repeated, once per value, in order. */
export function pageUrl(
  path: string,
  parameters: Readonly<Record<string, string | readonly string[]>>,
  after: Position,
): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(parameters)) {
    for (const each of typeof value === "string" ? [value] : value) {
      query.append(name, each);
    }
  }
  query.set("after", formatPosition(after));
  return `${path}?${query.toString()}`;
}
