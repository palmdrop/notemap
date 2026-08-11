import { stringify } from "yaml";

import type { ItemRecord, MirrorRecord } from "@notemap/core";

export type FrontmatterValue = string | number | boolean | readonly string[];

/**
 * Where each of an item's fields goes in the frontmatter, or `null` where it
 * deliberately goes nowhere. Keyed by `ItemRecord`, so a field added to the
 * domain fails to compile until someone decides which of the two it is.
 *
 * The names are an interop contract — other tools read these files — so they
 * are stable across a rename on the domain side, and several are the PROV terms
 * rather than notemap's own.
 */
const KEYS = {
  id: "id",
  source: "capture_source",
  sourceItemId: "source_id",
  payload: "payload_type",
  createdAt: "captured_at",
  contentUpdatedAt: "updated_at",
  archived: "archived_at",
  tags: "tags",
  revisionOf: "wasRevisionOf",
} as const satisfies Record<keyof ItemRecord, string | null>;

/** A renderer may add its own keys, but never shadow one of these. */
export const FIXED_KEYS: readonly string[] = [
  ...Object.values(KEYS),
  "wasAttributedTo",
];

export function fixedFrontmatter(
  record: MirrorRecord,
): Map<string, FrontmatterValue> {
  const item = record.item;
  const entries = new Map<string, FrontmatterValue>([
    [KEYS.id, item.id],
    [KEYS.source, item.source],
    [KEYS.sourceItemId, item.sourceItemId],
    [KEYS.payload, item.payload.type],
    [KEYS.createdAt, item.createdAt],
    ["wasAttributedTo", item.source],
  ]);

  if (item.contentUpdatedAt !== undefined) {
    entries.set(KEYS.contentUpdatedAt, item.contentUpdatedAt);
  }
  if (item.archived !== undefined) {
    entries.set(KEYS.archived, item.archived.archivedAt);
  }
  if (item.tags.length > 0) {
    entries.set(
      KEYS.tags,
      item.tags.map((tag) => tag.name),
    );
  }
  if (item.revisionOf !== undefined) {
    entries.set(KEYS.revisionOf, item.revisionOf);
  }

  return entries;
}

/** Every string is quoted, so no value can be read back as a number, a bool or null. */
export function toYaml(entries: ReadonlyMap<string, FrontmatterValue>): string {
  const body = stringify(Object.fromEntries(entries), {
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    lineWidth: 0,
  });

  return `---\n${body}---\n`;
}
