/**
 * A hashtag ends on a letter or a digit, so `#kind/quote.` and `#project/` are
 * not ones — and a line holding something that is not a hashtag is prose, which
 * is what keeps `#include <stdio.h>` and `color: #ff0000;` out of the tag set
 * without this knowing what a code fence is. A line of nothing but `#ff0000`
 * *is* read: nothing tells that from a tag, and somebody wrote it on its own.
 */
const HASHTAG = /^#[\p{L}\p{N}](?:[\p{L}\p{N}/_-]*[\p{L}\p{N}])?$/u;

function isTagLine(line: string): boolean {
  const written = line.trim();
  return (
    written !== "" && written.split(/\s+/).every((one) => HASHTAG.test(one))
  );
}

function isBlank(line: string): boolean {
  return line.trim() === "";
}

export type TagFoot = {
  /** The names the foot spells, in reading order. */
  readonly tags: readonly string[];
  /** What stands above it, or nothing at all where the foot was the whole of it. */
  readonly prose: string;
};

/**
 * The tags a note's last lines spell, and the prose above them. Consecutive tag
 * lines are one foot: two lines of tags is how somebody writes more than fits.
 *
 * Only the foot, never a `#tag` mid-sentence, which is a word somebody wrote.
 */
export function tagFootOf(text: string): TagFoot {
  const lines = text.split("\n");

  // The blank lines a file ends with are nobody's classification, and stopping
  // on one would mean the rule read `…\n#kind/quote` and not `…\n#kind/quote\n`
  // — which is the shape a markdown note's own hashtag foot is written in.
  let end = lines.length;
  while (end > 0 && isBlank(lines[end - 1] as string)) end -= 1;

  let at = end;
  while (at > 0 && isTagLine(lines[at - 1] as string)) at -= 1;
  if (at === end) return { tags: [], prose: text };

  return {
    tags: unique(
      lines
        .slice(at, end)
        .flatMap((line) => line.trim().split(/\s+/))
        .map((one) => one.slice(1)),
    ),
    prose: lines.slice(0, at).join("\n").replace(/\s+$/u, ""),
  };
}

export type Classified = {
  readonly text: string | undefined;
  readonly tags: readonly string[];
};

/**
 * Prose and tags as the pool takes them: the foot read off where the relay was
 * asked to read it, and left where it is where it was not. A foot's tags come
 * after the ones the relay was configured with.
 *
 * A note that is *only* a foot keeps its text, since taking it off would leave
 * an empty capture, which a relay refuses.
 */
export function classified(
  text: string | undefined,
  tags: readonly string[],
  hashtags: boolean,
): Classified {
  if (!hashtags || text === undefined) return { text, tags };

  const foot = tagFootOf(text);
  if (foot.tags.length === 0) return { text, tags };

  return {
    text: foot.prose === "" ? text : foot.prose,
    tags: unique([...tags, ...foot.tags]),
  };
}

function unique(names: readonly string[]): readonly string[] {
  return [...new Set(names)];
}
