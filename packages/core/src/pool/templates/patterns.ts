import type { RoutingTemplateRefusal } from "#types/api/refusal";
import type { ItemId, SourceId, Timestamp } from "#types/domain/ids";
import type { JsonObject, JsonValue } from "#types/json";

/**
 * What a pattern may expand to, and what it is expanded against. Every field is
 * present on every item, which is what makes a template that saved expand for
 * anything it is ever applied to.
 */
export type Expansion = {
  readonly capturedAt: Timestamp;
  /** Minutes east of UTC where the capture was made, where the capture knew. */
  readonly utcOffset?: number;
  /** The host's IANA zone, for a capture that carried no offset of its own. */
  readonly zone: string;
  readonly item: ItemId;
  readonly source: SourceId;
};

const PATTERN = /\{\{([^{}]*)\}\}/g;

const CAPTURED_AT = "captured_at";

/** Named rather than written: a format nobody has yet is a line here, not a grammar. */
const DATE_FORMATS = [
  "date",
  "datetime",
  "time",
  "month",
  "week",
  "year",
] as const;

type DateFormat = (typeof DATE_FORMATS)[number];

/** Said out loud where a refusal has to list what a person could have written. */
export const PATTERN_FIELDS = [CAPTURED_AT, "item", "source"] as const;

/**
 * Every pattern in every string, at every depth. Called when a template is
 * saved, so a typo is found by the person who typed it rather than by a
 * delivery a week later — and so there is no second refusal at route time to
 * design, draw or explain.
 */
export function checkPatterns(
  args: JsonObject,
): RoutingTemplateRefusal | undefined {
  let refusal: RoutingTemplateRefusal | undefined;

  walk(args, (text) => {
    for (const [whole, inside] of matches(text)) {
      refusal ??= unwritable(whole, inside);
    }
    return text;
  });

  return refusal;
}

/**
 * The same strings with every pattern replaced. Total by construction: what
 * `checkPatterns` accepted expands, for every item, forever.
 */
export function expandPatterns(
  args: JsonObject,
  against: Expansion,
): JsonObject {
  return walk(args, (text) =>
    text.replace(PATTERN, (whole, inside: string) => {
      const value = expanded(inside.trim(), against);
      return value ?? whole;
    }),
  ) as JsonObject;
}

function unwritable(
  whole: string,
  inside: string,
): RoutingTemplateRefusal | undefined {
  const [field, format, ...rest] = inside.trim().split(":");

  if (field === undefined || !named(field) || rest.length > 0) {
    return {
      kind: "unknown-pattern-field",
      pattern: whole,
      field: field ?? "",
    };
  }
  if (format === undefined) return undefined;
  if (field !== CAPTURED_AT || !dated(format)) {
    return { kind: "unknown-pattern-format", pattern: whole, format };
  }
  return undefined;
}

function named(field: string): field is (typeof PATTERN_FIELDS)[number] {
  return (PATTERN_FIELDS as readonly string[]).includes(field);
}

function dated(format: string): format is DateFormat {
  return (DATE_FORMATS as readonly string[]).includes(format);
}

function expanded(inside: string, against: Expansion): string | undefined {
  const [field, format] = inside.split(":");

  if (field === "item") return against.item;
  if (field === "source") return against.source;
  if (field !== CAPTURED_AT) return undefined;

  const parts = local(against);
  switch (format ?? "date") {
    case "date":
      return `${parts.year}-${parts.month}-${parts.day}`;
    // `-` rather than `:`, which is not a filename on every filesystem this
    // will ever meet.
    case "datetime":
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}-${parts.minute}`;
    case "time":
      return `${parts.hour}-${parts.minute}`;
    case "month":
      return `${parts.year}-${parts.month}`;
    case "week":
      return isoWeek(parts);
    case "year":
      return parts.year;
    default:
      return undefined;
  }
}

type Parts = {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly hour: string;
  readonly minute: string;
};

/**
 * The wall clock where the capture was made. The capture's own offset answers
 * it outright; without one the host's zone is asked what that instant read as
 * there, which is the only other place the truth could come from.
 */
function local(against: Expansion): Parts {
  const instant = new Date(against.capturedAt);
  const offset = against.utcOffset ?? offsetIn(against.zone, instant);
  const shifted = new Date(instant.getTime() + offset * 60_000);

  return {
    year: String(shifted.getUTCFullYear()).padStart(4, "0"),
    month: twoDigits(shifted.getUTCMonth() + 1),
    day: twoDigits(shifted.getUTCDate()),
    hour: twoDigits(shifted.getUTCHours()),
    minute: twoDigits(shifted.getUTCMinutes()),
  };
}

/**
 * Minutes east of UTC in a zone at one instant, DST included, read back off
 * what `Intl` says the wall clock was.
 */
function offsetIn(zone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const of = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  // `24` is midnight in some locales' 24-hour clock, and is the same instant.
  const hour = of("hour") % 24;
  const wall = Date.UTC(
    of("year"),
    of("month") - 1,
    of("day"),
    hour,
    of("minute"),
    of("second"),
  );

  return Math.round((wall - instant.getTime()) / 60_000);
}

/** ISO 8601: the week owning the Thursday of the week the day falls in. */
function isoWeek(parts: Parts): string {
  const day = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  );
  const weekday = (day.getUTCDay() + 6) % 7;
  const thursday = new Date(day.getTime() + (3 - weekday) * 86_400_000);
  const january = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week =
    Math.floor((thursday.getTime() - january) / (7 * 86_400_000)) + 1;

  return `${String(thursday.getUTCFullYear()).padStart(4, "0")}-W${twoDigits(week)}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function* matches(text: string): Generator<readonly [string, string]> {
  for (const found of text.matchAll(PATTERN)) {
    yield [found[0], found[1] ?? ""] as const;
  }
}

/** String values only, at every depth, leaving every other JSON value alone. */
function walk(value: JsonValue, each: (text: string) => string): JsonValue {
  if (typeof value === "string") return each(value);
  if (Array.isArray(value)) return value.map((item) => walk(item, each));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, held]) => [key, walk(held, each)]),
    );
  }
  return value;
}
