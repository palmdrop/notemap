import { ok, refused } from "#utils/result";
import type { TagName } from "#types/domain/ids";
import type { TagFilter } from "#types/domain/filter";
import type { TagFilterRefusal } from "#types/api/refusal";
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
