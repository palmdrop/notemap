import type { Attachment } from "svelte/attachments";

import { found } from "@notemap/text";

const SEARCH = "search";

function search(): Highlight | undefined {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return undefined;
  const held = CSS.highlights.get(SEARCH);
  if (held !== undefined) return held;
  const made = new Highlight();
  CSS.highlights.set(SEARCH, made);
  return made;
}

/**
 * Highlights where the terms are in the text an element draws, leaving the
 * element as it is. Each text node is searched on its own, so a term drawn
 * across two is not found. Nothing, where the browser has no highlights.
 */
export function highlighting(
  terms: readonly string[],
): Attachment<HTMLElement> {
  return (element) => {
    if (terms.length === 0) return;
    const highlight = search();
    if (highlight === undefined) return;

    const ranges: Range[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (
      let node = walker.nextNode();
      node !== null;
      node = walker.nextNode()
    ) {
      for (const { from, to } of found(node.textContent ?? "", terms)) {
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, to);
        ranges.push(range);
        highlight.add(range);
      }
    }

    return () => {
      for (const range of ranges) highlight.delete(range);
    };
  };
}
