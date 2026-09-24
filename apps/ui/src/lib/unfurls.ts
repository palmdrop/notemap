import { Refused, type Client, type Unfurl } from "@notemap/client";

import { client } from "$lib/client";

/** Refused for what the link is, which asking again will not change. */
export function refusedLink(error: unknown): boolean {
  return (
    error instanceof Refused &&
    (error.code === "address-refused" || error.code === "bad-url")
  );
}

/**
 * One request per link for as long as the page holds this client, however many
 * rows draw it — a link refused for what it is included. What was never asked,
 * the pool setting being off, and what failed for any other reason are
 * forgotten, so the next draw asks again.
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
    (error: unknown) => {
      if (!refusedLink(error)) held.delete(url);
    },
  );
  return answer;
}
