import type { Item } from "@notemap/client";

import { client } from "./client";
import { briefly } from "./stamp";

/** Enough of a capture to recognise which one it was, and no more. */
const ENOUGH = 60;

/** Enough of a capture to scan a list of them by, one line each. */
const A_LINE = 96;

/** What opens a line of Markdown — a heading, a quote, a list item, a task box — and says nothing. */
const OPENING =
  /^(?:#{1,6}(?:\s+|$)|>\s?|[-*+](?:\s+|$)|\d+[.)](?:\s+|$)|\[[ xX]\](?:\s+|$))+/;

/** A rule, which is all marks. */
const RULE = /^[-*_=]{3,}$/;

/**
 * The first line that says anything, as it reads rather than as it was
 * typed: `## Inbox` is `Inbox`, a link its words, and emphasis its letters.
 */
function firstLine(said: string): string | undefined {
  for (const line of said.split("\n")) {
    const plain = line
      .trim()
      .replace(RULE, "")
      .replace(OPENING, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\*\*|__|~~|`/g, "")
      .replace(/(^|[^\p{L}\p{N}])[*_]([^*_]+)[*_](?![\p{L}\p{N}])/gu, "$1$2")
      .trim();
    if (plain !== "") return plain;
  }
  return undefined;
}

export function excerptOf(said: string): string | undefined {
  const first = firstLine(said);
  if (first === undefined) return undefined;

  return first.length <= ENOUGH ? first : `${first.slice(0, ENOUGH - 1)}…`;
}

/**
 * The first words of a capture as one line, cut at a word where there are more
 * than a line's worth. Everything after the first line break is more than a
 * line already.
 */
export function lineOf(said: string, most = A_LINE): string | undefined {
  const first = firstLine(said);
  if (first === undefined) return undefined;
  if (first.length <= most) return first;

  const cut = first.slice(0, most);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > most / 2 ? cut.slice(0, atWord) : cut).trimEnd()} …`;
}

/**
 * Which capture a notice is about: the stamp the row was read by, and its own
 * first words. A place and a path say where something went; only this says
 * what went.
 */
export function aboutItem(item: Item): string {
  const said = excerptOf(client.says(item));
  const stamp = briefly(item.createdAt);

  return `${stamp}: ${said ?? item.payload.type}`;
}
