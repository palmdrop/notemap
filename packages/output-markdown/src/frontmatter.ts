import { dump } from "js-yaml";

import type { Delivery } from "@notemap/core";

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

/** A renderer may add its own keys, but never shadow one of these. */
export const FIXED_KEYS: readonly string[] = [
  ...Object.values<string | null>(KEYS).filter((key) => key !== null),
  ...Object.values(PROVENANCE),
];

export function fixedFrontmatter(
  delivery: Delivery,
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
  if (delivery.tags.length > 0) {
    entries.set(
      KEYS.tags,
      delivery.tags.map((tag) => tag.name),
    );
  }

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
