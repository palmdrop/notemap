/** What another app shared, as the share sheet names its parts. */
export type Shared = {
  readonly title?: string;
  readonly text?: string;
  readonly url?: string;
};

/**
 * One text from a share's parts, each said once. Apps disagree about where a
 * link goes: many put it in the text and leave the url empty, some give it
 * twice, and some give a title that is the text over again.
 */
export function wordsOf(shared: Shared): string {
  const title = shared.title?.trim() ?? "";
  const text = shared.text?.trim() ?? "";
  const url = shared.url?.trim() ?? "";

  const parts = [text];
  if (url !== "" && !text.includes(url)) parts.push(url);
  if (title !== "" && title !== url && !text.includes(title)) {
    parts.unshift(title);
  }

  return parts.filter((part) => part !== "").join("\n");
}
