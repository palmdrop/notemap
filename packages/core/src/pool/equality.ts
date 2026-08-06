import type { JsonObject, JsonValue } from "../types/json";
import type { Timestamp } from "../types/domain/ids";

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural, because a resubmission is JSON that has been serialized and
 * parsed at least once on each side. Key order survives that round trip but is
 * not part of what the value means, so comparing the serialized forms would
 * report a difference that is not one.
 */
export function sameJson(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;

  if (isJsonObject(a) && isJsonObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => key in b && sameJson(a[key] ?? null, b[key] ?? null))
    );
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const other: readonly JsonValue[] = b;
    return (
      a.length === other.length &&
      a.every((value: JsonValue, index: number) =>
        sameJson(value, other[index] ?? null),
      )
    );
  }

  return false;
}

/**
 * Instants, not spellings. A store is free to give a timestamp back in its own
 * canonical form, so `2026-08-03T09:00:00Z` and `2026-08-03T09:00:00.000Z` are
 * the same capture time and must not read as a conflict.
 */
export function sameInstant(a: Timestamp, b: Timestamp): boolean {
  return Date.parse(a) === Date.parse(b);
}
