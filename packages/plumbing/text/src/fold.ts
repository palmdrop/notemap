/**
 * The combining diacritical marks — an accent, as Latin, Greek and Cyrillic
 * write one. Not every nonspacing mark: a kana's voicing mark or a Devanagari
 * vowel sign makes a different syllable, not an accented one.
 */
const ACCENTS: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe20, 0xfe2f],
];

function accented(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return ACCENTS.some(([from, to]) => code >= from && code <= to);
}

/**
 * Lower-cased and with its accents dropped, its whitespace as it was.
 * Lower-casing comes first, since it can itself decompose a letter into one and
 * a mark.
 */
export function unaccented(text: string): string {
  return [...text.toLowerCase().normalize("NFD")]
    .filter((character) => !accented(character))
    .join("")
    .normalize("NFC");
}

/** Words as a search compares them: `unaccented`, every run of whitespace one space. */
export function fold(text: string): string {
  return unaccented(text).replace(/\s+/gu, " ").trim();
}

/**
 * The longest `words` a filter takes, in UTF-16 code units of the parameter as
 * sent. Past it is a paste rather than a question.
 */
export const MAX_WORDS = 200;

/** The terms some words come to, each folded: none for words that are only space. */
export function termsOf(words: string): readonly string[] {
  const folded = fold(words);
  return folded === "" ? [] : [...new Set(folded.split(" "))];
}

/** Whether every term is somewhere in what was already folded. */
export function holds(folded: string, terms: readonly string[]): boolean {
  return terms.every((term) => folded.includes(term));
}

/** Every string a JSON value holds, at any depth, in document order. */
export function stringsIn(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(stringsIn);
  }
  return [];
}
