import type { Delivery } from "@notemap/core";

import { oneSegment } from "./names";

const MAX_STEM = 60;

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
  const line = firstLine(content);
  const stem = oneSegment(line.slice(0, MAX_STEM), fallback);

  return `${stem}.md`;
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
