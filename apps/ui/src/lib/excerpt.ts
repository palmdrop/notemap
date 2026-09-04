import type { Item } from "@notemap/client";

import { client } from "./client";
import { briefly } from "./stamp";

/** Enough of a capture to recognise which one it was, and no more. */
const ENOUGH = 60;

export function excerptOf(said: string): string | undefined {
  const first = said.trim().split("\n")[0]?.trim();
  if (first === undefined || first === "") return undefined;

  return first.length <= ENOUGH ? first : `${first.slice(0, ENOUGH - 1)}…`;
}

/**
 * Which capture a notice is about: the stamp the row was read by, and its own
 * first words. A place and a path say where something went; only this says
 * what went.
 */
export function aboutItem(item: Item): string {
  const said = excerptOf(client.says(item));
  const stamp = briefly(item.createdAt);

  return said === undefined
    ? `${stamp} · ${item.payload.type}`
    : `${stamp} · ${said}`;
}
