import type { Delivery, JsonValue } from "@notemap/core";

import { oneSegment } from "./paths";

const MAX_STEM = 60;

/**
 * What to call a note nobody named.
 *
 * The derivation is weak, and knowingly: **the domain has no title**. The first
 * line of whatever string the payload carries is the best guess available, and
 * the item id is what is left when there is none — which is what a capture with
 * no prose gets, and it is ugly.
 */
export function deriveFilename(delivery: Delivery): string {
  const line = firstLine(delivery.payload.content);
  const stem = oneSegment(line.slice(0, MAX_STEM), delivery.item);

  return `${stem}.md`;
}

/** The first line of the longest string in the content, at any depth. */
function firstLine(content: JsonValue): string {
  const longest = strings(content).reduce(
    (most, value) => (value.length > most.length ? value : most),
    "",
  );

  return (longest.split("\n").find((line) => line.trim() !== "") ?? "").trim();
}

function strings(value: JsonValue): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}
