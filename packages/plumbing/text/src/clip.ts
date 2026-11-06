/** How much of a string may be kept. Whichever runs out first ends it. */
export type Budget = {
  /** As a reader counts them: whole graphemes, so `é` is one however it is encoded. */
  readonly characters: number;
  /** As a filesystem counts them, in UTF-8. One grapheme may be dozens. */
  readonly bytes: number;
};

// A fixed locale, so the shell and the daemon cut a name in the same place
// whatever either of them is running in.
const graphemes = new Intl.Segmenter("und", { granularity: "grapheme" });
const words = new Intl.Segmenter("und", { granularity: "word" });
const encoder = new TextEncoder();

/** The longest start of `text` that fits, never ending inside a grapheme. */
export function clip(text: string, budget: Budget): string {
  return text.slice(0, fitting(graphemes.segment(text), budget));
}

/**
 * The longest start of `text` that fits and ends where a word or a run between
 * words does. Where the first word alone overruns, it is cut as `clip` cuts.
 * Words are found by segmenting rather than by spaces, so a script written
 * without them is still cut between its words.
 */
export function clipAtWord(text: string, budget: Budget): string {
  const end = fitting(words.segment(text), budget);
  return end === 0 ? clip(text, budget) : text.slice(0, end);
}

/** Where the last whole segment that fits ends. */
function fitting(segments: Intl.Segments, budget: Budget): number {
  let characters = 0;
  let bytes = 0;
  let end = 0;

  for (const { segment, index } of segments) {
    characters += [...graphemes.segment(segment)].length;
    bytes += encoder.encode(segment).length;
    if (characters > budget.characters || bytes > budget.bytes) break;
    end = index + segment.length;
  }

  return end;
}
