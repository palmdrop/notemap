import type { Client, Unfurl } from "@notemap/client";

import { client } from "$lib/client";

/**
 * One request per link for as long as the page holds this client, however many
 * rows draw it. What was never asked — the pool setting was off — and what
 * failed are forgotten, so the next draw asks again.
 */
const asked = new WeakMap<Client, Map<string, Promise<Unfurl | undefined>>>();

export function unfurled(url: string): Promise<Unfurl | undefined> {
  let held = asked.get(client);
  if (held === undefined) {
    held = new Map();
    asked.set(client, held);
  }
  const reading = held.get(url);
  if (reading !== undefined) return reading;

  const answer = client.unfurl(url);
  held.set(url, answer);
  answer.then(
    (unfurl) => {
      if (unfurl === undefined) held.delete(url);
    },
    () => held.delete(url),
  );
  return answer;
}
