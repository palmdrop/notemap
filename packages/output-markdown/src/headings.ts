import { fromMarkdown } from "mdast-util-from-markdown";
import type {
  CandidateEntry,
  CandidatesAnswer,
  CandidatesRequest,
} from "@notemap/core";

import { headingKey, headingText, isHeading } from "./sections";

export const HEADING = "heading";

/** The argument naming the note whose headings a heading browse lists. */
export const HEADING_NOTE = "path";

/** The same cap a folder is browsed under. */
const LIMIT = 500;

/**
 * The note a heading browse is about, or nothing where `path` names a folder
 * and the filename is not derived until delivery.
 */
export function headingsNote(request: CandidatesRequest): string | undefined {
  const path = request.given?.[HEADING_NOTE] ?? "";
  return path === "" || path.endsWith("/") ? undefined : path;
}

/**
 * Every heading the splice could file under, in the order it would find them,
 * and each once: the splice takes the first match, so a second entry with the
 * same words, in any case, would offer a choice that does not exist. The value is exactly
 * the text the splice matches on; the label keeps the `#`s, which is how a
 * person tells a section from a subsection in their own note.
 */
export function headingCandidates(note: string): CandidatesAnswer {
  const seen = new Set<string>();
  const entries: CandidateEntry[] = [];

  for (const node of fromMarkdown(note).children) {
    if (!isHeading(node)) continue;
    const text = headingText(note, node);
    if (text === "" || seen.has(headingKey(text))) continue;

    seen.add(headingKey(text));
    entries.push({ label: `${"#".repeat(node.depth)} ${text}`, value: text });
  }

  return {
    truncated: entries.length > LIMIT,
    entries: entries.slice(0, LIMIT),
  };
}

export const NO_HEADINGS: CandidatesAnswer = { truncated: false, entries: [] };
