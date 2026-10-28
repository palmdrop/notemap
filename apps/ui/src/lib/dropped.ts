import { writing } from "./command/keys";
import type { Entry } from "./walking";

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

/** Inputs that take no text, so a paste there means nothing of its own. */
const UNWRITTEN = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** Whether the focus is somewhere a paste means something of its own. */
export function isField(target: EventTarget | null): boolean {
  return (
    writing(target) &&
    !(target instanceof HTMLInputElement && UNWRITTEN.has(target.type))
  );
}

/**
 * What a drop holds, taken while the drop is still being dispatched: the
 * browser empties it once the event is over. An entry where the browser
 * offers one, since only an entry can be read into as a folder.
 */
export function droppedOf(
  data: Pick<DataTransfer, "files"> & { readonly items?: DataTransferItemList },
): readonly (Entry | File)[] {
  const items = [...(data.items ?? [])].filter((item) => item.kind === "file");
  if (items.length === 0) return [...data.files];

  return items.flatMap((item): (Entry | File)[] => {
    const entry = item.webkitGetAsEntry();
    if (entry !== null) return [entry];
    const file = item.getAsFile();
    return file === null ? [] : [file];
  });
}

/** The folders among what was dropped, which take a walk before anything is attached. */
export function foldersOf(
  dropped: readonly (Entry | File)[],
): readonly Entry[] {
  return dropped.filter(
    (one): one is Entry => !(one instanceof File) && one.isDirectory,
  );
}

/** As many files as attach without asking, so long as together they stay under `AT_ONCE_BYTES`. */
export const AT_ONCE = 3;
export const AT_ONCE_BYTES = 25_000_000;

/** Whether arriving files are many or large enough to have come by accident. */
export function asksFirst(files: readonly Pick<File, "size">[]): boolean {
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  return files.length > AT_ONCE || bytes >= AT_ONCE_BYTES;
}
