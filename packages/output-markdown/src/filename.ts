import type { Delivery } from "@notemap/core";
import { clipAtWord, type Budget } from "@notemap/text";

const STEM: Budget = { characters: 40, bytes: 160 };

/** What to call a note nobody named. Weak, knowingly: **the domain has no title**. */
export function deriveFilename(delivery: Delivery): string {
  return filenameFrom(delivery.payload.content, delivery.item);
}

/**
 * The same derivation without a delivery to hand, so a surface can show the
 * name a note is about to get. `unknown` rather than `JsonValue`: this walks
 * whatever it is given, and taking the domain's type would make the shell
 * depend on core to say what it will call a file.
 */
export function filenameFrom(content: unknown, fallback: string): string {
  const stem = trimmed(clipAtWord(slug(firstLine(content)), STEM));
  return `${stem === "" ? fallback : stem}.md`;
}

/**
 * Lower-cased, every run of anything but letters, marks and digits made one
 * `-`. An apostrophe is dropped rather than made a dash: `lena's` is one word.
 */
function slug(line: string): string {
  return trimmed(
    line
      .toLowerCase()
      .normalize("NFC")
      .replace(/\p{Quotation_Mark}/gu, "")
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-"),
  );
}

function trimmed(stem: string): string {
  return stem.replace(/^-+|-+$/g, "");
}

/** The first line of the longest string in the content, at any depth. */
function firstLine(content: unknown): string {
  const longest = strings(content).reduce(
    (most, value) => (value.length > most.length ? value : most),
    "",
  );

  return (longest.split("\n").find((line) => line.trim() !== "") ?? "").trim();
}

function strings(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}
