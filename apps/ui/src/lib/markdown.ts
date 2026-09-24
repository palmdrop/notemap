import { micromark } from "micromark";
import {
  gfmAutolinkLiteral,
  gfmAutolinkLiteralHtml,
} from "micromark-extension-gfm-autolink-literal";

import { followable } from "./link";

/**
 * What a person wrote, as CommonMark, ready to be put into the page. Raw HTML in
 * the source is escaped rather than passed through, and a link is kept only
 * where its address is one this shell would follow anyway: a `javascript:`
 * address in an `href` is script on this origin, and the words came from a
 * capture, a destination or a template — never from the shell.
 */
export function rendered(text: string): string {
  const holder = document.createElement("template");
  holder.innerHTML = micromark(text, {
    extensions: [gfmAutolinkLiteral()],
    htmlExtensions: [gfmAutolinkLiteralHtml()],
  });

  for (const link of holder.content.querySelectorAll("a[href]")) {
    const href = followable(link.getAttribute("href") ?? undefined);
    if (href === undefined) {
      link.removeAttribute("href");
    } else {
      link.setAttribute("rel", "noreferrer");
    }
  }

  return holder.innerHTML;
}

/** Every address the rendered text would let a reader follow, each once, in the order written. */
export function links(text: string): string[] {
  const holder = document.createElement("template");
  holder.innerHTML = rendered(text);
  const hrefs = [...holder.content.querySelectorAll("a[href]")].map(
    (link) => link.getAttribute("href") ?? "",
  );
  return [...new Set(hrefs)];
}
