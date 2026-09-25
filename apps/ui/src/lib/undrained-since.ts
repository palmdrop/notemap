import { client } from "./client";

/**
 * When each piece of undrained work was first asked about, for as long as the
 * shell runs: a mark drawn again later — the queue visited again, the feed and
 * back — knows how long its work has already waited, rather than counting from
 * its own drawing. What drains is forgotten as it does.
 */
const since = new Map<string, number>();
let watching = false;

export function undrainedSince(id: string): number {
  if (!watching) {
    watching = true;
    client.undrained.subscribe((ids) => {
      for (const one of [...since.keys()]) {
        if (!ids.has(one)) since.delete(one);
      }
    });
  }
  const seen = since.get(id);
  if (seen !== undefined) return seen;
  const now = Date.now();
  since.set(id, now);
  return now;
}
