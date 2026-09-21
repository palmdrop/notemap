import { dump } from "js-yaml";

import { INHERITS_FIELD } from "@notemap/core";
import type { Delivery, JsonObject, JsonSchema } from "@notemap/core";

export type FrontmatterValue = string | number | boolean | readonly string[];

/**
 * Keyed by `Delivery`, so a field added to the domain fails to compile until
 * someone decides where it goes — `null` meaning deliberately nowhere.
 */
const KEYS = {
  item: "id",
  destination: null,
  capability: null,
  arguments: null,
  source: "capture_source",
  payload: "payload_type",
  createdAt: "captured_at",
  contentUpdatedAt: "updated_at",
  tags: "tags",
  artifacts: null,
  assets: null,
} as const satisfies Record<keyof Delivery, string | null>;

/** The one thing a file at a destination cannot recover for itself. */
const PROVENANCE = {
  attribution: "wasAttributedTo",
  origin: "derived_from",
} as const;

/** A renderer may add its own keys, but never shadow one of these — whichever of them this note writes. */
export const FIXED_KEYS: readonly string[] = [
  ...Object.values<string | null>(KEYS).filter((key) => key !== null),
  ...Object.values(PROVENANCE),
];

/** `tags` is what the note carries rather than what the item holds, since not every tag goes. */
export function fixedFrontmatter(
  delivery: Delivery,
  tags: readonly string[],
): Map<string, FrontmatterValue> {
  const entries = new Map<string, FrontmatterValue>([
    [KEYS.item, delivery.item],
    [KEYS.source, delivery.source],
    [KEYS.payload, delivery.payload.type],
    [KEYS.createdAt, delivery.createdAt],
    [PROVENANCE.attribution, delivery.source],
    [PROVENANCE.origin, `urn:commons:item:${delivery.item}`],
  ]);

  if (delivery.contentUpdatedAt !== undefined) {
    entries.set(KEYS.contentUpdatedAt, delivery.contentUpdatedAt);
  }
  if (tags.length > 0) entries.set(KEYS.tags, tags);

  return entries;
}

/** Every string is quoted, so no value can be read back as a number, a bool or null. */
export function toYaml(entries: ReadonlyMap<string, FrontmatterValue>): string {
  const body = dump(Object.fromEntries(entries), {
    forceQuotes: true,
    lineWidth: -1,
  });

  return `---\n${body}---\n`;
}

/** How much provenance goes above a note. A string rather than a flag: there is
 * room between all of it and none of it, and nothing to migrate when it is wanted. */
export type FrontmatterMode = "full" | "none";

export const FRONTMATTER = "frontmatter";

/**
 * The destination's own default. Never `required`: settings are re-validated on
 * every `describe`, and a destination that no longer satisfies its kind's
 * schema is reported unusable.
 */
export const FRONTMATTER_SETTING: JsonSchema = {
  type: "string",
  enum: ["full", "none"],
  default: "none",
  title: "Frontmatter",
  description:
    "How much provenance is written above a note this destination writes. Left unset, none is.",
};

/**
 * The same choice for one capture. Left unset, the destination's own decides,
 * and the default here is what that comes out as where the destination never
 * said either.
 */
export const FRONTMATTER_MODE: JsonSchema = {
  type: "string",
  enum: ["full", "none"],
  default: "none",
  title: "frontmatter",
  description:
    "How much provenance is written above this note. Left unset, the destination's own setting decides.",
  [INHERITS_FIELD]: true,
};

/** Absent inherits the destination's setting, and an absent setting is `none`. */
export function frontmatterModeOf(
  args: JsonObject,
  setting: FrontmatterMode = "none",
): FrontmatterMode {
  const held = args[FRONTMATTER];
  return held === "full" || held === "none" ? held : setting;
}

/** Read rather than cast, as a settings reader reads everything else. */
export function frontmatterSettingOf(
  settings: JsonObject,
): FrontmatterMode | undefined {
  const held = settings[FRONTMATTER];
  return held === "full" || held === "none" ? held : undefined;
}
