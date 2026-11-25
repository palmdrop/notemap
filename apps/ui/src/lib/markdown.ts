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
      link.setAttribute("target", "_blank");
    }
  }

  // A task list item, `- [ ] call back`: drawn as the box it stands for rather
  // than as the brackets it was typed with.
  for (const item of holder.content.querySelectorAll("li")) {
    const first = item.firstChild;
    if (first?.nodeType !== Node.TEXT_NODE) continue;
    const said = first.textContent ?? "";
    const task = /^\[( |x|X)\]\s/.exec(said);
    if (task === null) continue;
    const box = document.createElement("input");
    box.type = "checkbox";
    box.setAttribute("disabled", "");
    if (task[1] !== " ") box.setAttribute("checked", "");
    box.className = "task";
    first.textContent = said.slice(task[0].length);
    item.insertBefore(box, first);
    item.classList.add("task-item");
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
