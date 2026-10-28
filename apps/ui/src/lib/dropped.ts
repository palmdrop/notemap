/** Whether a drag carries files, rather than text, a link or something on the page. */
export function carriesFiles(types: readonly string[]): boolean {
  return types.includes("Files");
}

/**
 * The files a paste attaches. None where the clipboard carries text too: a
 * copy out of a word processor or a spreadsheet carries a picture of the text
 * beside it, and is pasted as the text.
 */
export function pastedFiles(
  data: Pick<DataTransfer, "types" | "files"> | null,
): readonly File[] {
  if (data === null || data.types.includes("text/plain")) return [];
  return [...data.files];
}

/** Whether the focus is somewhere a paste means something of its own. */
export function isField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}
