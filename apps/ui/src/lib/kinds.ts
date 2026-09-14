/**
 * What a kind of action is called on a row. The pool's names are the wire's —
 * hyphenated, and saying `archived` where the shell says discard — and a row's
 * heading is read by a person, so the hyphen is a space and the archive is
 * called what the UI calls it everywhere else.
 */
const SAID: Readonly<Record<string, string>> = {
  archived: "discarded",
  unarchived: "undiscarded",
};

export function kindWord(kind: string): string {
  return SAID[kind] ?? kind.replaceAll("-", " ");
}
