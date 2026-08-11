import type { MirrorRecord } from "@notemap/core";

export type FrontmatterValue = string | number | boolean | readonly string[];

/**
 * The keys the driver emits from the record. A renderer may add its own but
 * never these: provenance is a standing guarantee, not something a host's
 * rendering gets to drop or rewrite.
 */
export const FIXED_KEYS = [
  "id",
  "capture_source",
  "source_id",
  "payload_type",
  "captured_at",
  "updated_at",
  "archived_at",
  "tags",
  "wasAttributedTo",
  "wasRevisionOf",
] as const;

export function fixedFrontmatter(
  record: MirrorRecord,
): Map<string, FrontmatterValue> {
  const item = record.item;
  const entries = new Map<string, FrontmatterValue>([
    ["id", item.id],
    ["capture_source", item.source],
    ["source_id", item.sourceItemId],
    ["payload_type", item.payload.type],
    ["captured_at", item.createdAt],
    ["wasAttributedTo", item.source],
  ]);

  if (item.contentUpdatedAt !== undefined) {
    entries.set("updated_at", item.contentUpdatedAt);
  }
  if (item.archived !== undefined) {
    entries.set("archived_at", item.archived.archivedAt);
  }
  if (item.tags.length > 0) {
    entries.set(
      "tags",
      item.tags.map((tag) => tag.name),
    );
  }
  if (item.revisionOf !== undefined) {
    entries.set("wasRevisionOf", item.revisionOf);
  }

  return entries;
}

/**
 * YAML, emitted rather than templated. Every string goes out as a JSON string,
 * which YAML 1.2 accepts verbatim as a double-quoted scalar — so a filename
 * with a colon or a tag with a hash cannot break the block.
 */
export function toYaml(entries: ReadonlyMap<string, FrontmatterValue>): string {
  const lines = ["---"];

  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const each of value) lines.push(`  - ${JSON.stringify(each)}`);
    } else {
      lines.push(
        `${key}: ${scalar(value as Exclude<FrontmatterValue, readonly string[]>)}`,
      );
    }
  }

  lines.push("---");
  return `${lines.join("\n")}\n`;
}

function scalar(value: string | number | boolean): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}
