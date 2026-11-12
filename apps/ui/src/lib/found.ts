import { fold } from "@notemap/text";

/** Where in some text a term was found, in UTF-16 offsets of the text as written. */
export type Span = { readonly from: number; readonly to: number };

const graphemes = new Intl.Segmenter("und", { granularity: "grapheme" });

/**
 * Where any of the terms are in the text, folded as the pool folds an item's
 * words, in order and with overlapping spans joined. Folding can change a
 * text's length, so each grapheme is folded on its own and every folded unit
 * remembers the grapheme it came from; a span never splits one.
 */
export function found(text: string, terms: readonly string[]): readonly Span[] {
  let folded = "";
  const from: number[] = [];
  const to: number[] = [];
  for (const { segment, index } of graphemes.segment(text)) {
    // `fold` trims, which would let a term run on across a space.
    const each = /^\s+$/u.test(segment) ? " " : fold(segment);
    folded += each;
    for (let unit = 0; unit < each.length; unit++) {
      from.push(index);
      to.push(index + segment.length);
    }
  }

  const spans: Span[] = [];
  for (const term of terms) {
    if (term === "") continue;
    for (
      let at = folded.indexOf(term);
      at !== -1;
      at = folded.indexOf(term, at + 1)
    ) {
      spans.push({ from: from[at]!, to: to[at + term.length - 1]! });
    }
  }
  return joined(spans);
}

function joined(spans: Span[]): readonly Span[] {
  const sorted = spans.sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  for (const span of sorted) {
    const last = out.at(-1);
    if (last !== undefined && span.from <= last.to) {
      out[out.length - 1] = { from: last.from, to: Math.max(last.to, span.to) };
    } else {
      out.push(span);
    }
  }
  return out;
}
