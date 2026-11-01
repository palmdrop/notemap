import { termsOf } from "@notemap/text";

import { ok, refused } from "#utils/result";
import type { TagName } from "#types/domain/ids";
import type { TagFilter, WordsFilter } from "#types/domain/filter";
import type { TagFilterRefusal, WordsFilterRefusal } from "#types/api/refusal";
import type { Result } from "#types/result";
import { normalised } from "./tags";

/** Trimmed as tagging trims, so a filter matches what tagging wrote. */
export function tagFilter(
  names: readonly string[],
): Result<TagFilter, TagFilterRefusal> {
  const tags: TagName[] = [];
  for (const name of names) {
    const tag = normalised(name as TagName);
    if (tag === undefined) return refused({ kind: "tag-invalid", tag: name });
    if (!tags.includes(tag)) tags.push(tag);
  }
  return ok(tags as readonly TagName[] as TagFilter);
}

/** In characters, as typed. */
export const MAX_WORDS = 200;

/** Folded and split as an item's own words are, so the store compares like with like. Blank is no terms. */
export function wordsFilter(
  words: string,
): Result<WordsFilter, WordsFilterRefusal> {
  if (words.length > MAX_WORDS) {
    return refused({ kind: "words-too-long", limit: MAX_WORDS });
  }
  return ok(termsOf(words) as WordsFilter);
}
