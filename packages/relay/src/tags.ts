/**
 * What a hashtag may spell: a letter or a digit, then the marks a tag namespace
 * is written with. Nothing else, so a line holding `#kind/quote.` or `#ff0000.`
 * is prose and stays prose — a rule somebody can predict beats one that guesses.
 */
const HASHTAG = /^#[\p{L}\p{N}][\p{L}\p{N}/_-]*$/u;

/** A line spelling tags and nothing else. Blank is not one, which is what ends a foot. */
function isTagFoot(line: string): boolean {
  const written = line.trim();
  return (
    written !== "" && written.split(/\s+/).every((one) => HASHTAG.test(one))
  );
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
 * Only the foot, never a `#tag` mid-sentence — which is a word somebody wrote,
 * and reading it as classification would make a tag of `#include` in a code
 * fence and of `#1` in a sentence about issue one.
 */
export function tagFootOf(text: string): TagFoot {
  const lines = text.split("\n");

  let at = lines.length;
  while (at > 0 && isTagFoot(lines[at - 1] as string)) at -= 1;
  if (at === lines.length) return { tags: [], prose: text };

  return {
    tags: unique(
      lines
        .slice(at)
        .flatMap((line) => line.trim().split(/\s+/))
        .map((one) => one.slice(1)),
    ),
    prose: lines.slice(0, at).join("\n").replace(/\s+$/u, ""),
  };
}

export type Classified = {
  /** The prose to capture, which is what the note says once its foot is off. */
  readonly text: string | undefined;
  readonly tags: readonly string[];
};

/**
 * Prose and tags as the pool takes them: the foot read off where the relay was
 * asked to read it, and left where it is where it was not. A foot's tags come
 * after the ones the relay was configured with.
 *
 * A note that is *only* a foot keeps its text, since taking it off would leave
 * an empty capture, which a relay refuses — so its tags are read and its words
 * stand as written.
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
