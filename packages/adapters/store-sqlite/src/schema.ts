import type { JsonObject } from "@notemap/core";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

/**
 * Timestamps are stored as epoch milliseconds rather than as the RFC 3339 text
 * they are in the domain. Two sources may spell the same instant differently
 * (`09:00:00Z` and `09:00:00.000Z`), and those sort against each other wrongly
 * as text — which would break feed order, the one thing the feed guarantees.
 * The cost is that sub-millisecond precision does not survive a round trip.
 */
const timestamp = (name: string) => integer(name);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    /**
     * No foreign key to a sources table, because there is none: sources are
     * configuration core is handed, not rows it owns.
     */
    sourceId: text("source_id").notNull(),
    sourceItemId: text("source_item_id").notNull(),
    payloadType: text("payload_type").notNull(),
    payloadContent: text("payload_content", { mode: "json" })
      .$type<JsonObject>()
      .notNull(),
    payloadMetadata: text("payload_metadata", { mode: "json" })
      .$type<JsonObject>()
      .notNull(),
    createdAt: timestamp("created_at").notNull(),
    contentUpdatedAt: timestamp("content_updated_at"),
    modifiedAt: timestamp("modified_at").notNull(),
    revisionOf: text("revision_of").references((): AnySQLiteColumn => items.id),
    archivedAt: timestamp("archived_at"),
    archiveReason: text("archive_reason"),
  },
  (t) => [
    unique("items_source_identity").on(t.sourceId, t.sourceItemId),
    index("items_feed").on(t.createdAt, t.id),
    index("items_revision_of").on(t.revisionOf),
    index("items_modified_at").on(t.modifiedAt),
  ],
);

export const itemTags = sqliteTable(
  "item_tags",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    byKind: text("by_kind", {
      enum: ["person", "provider", "source"],
    }).notNull(),
    /** The provider or source that added it. Null when a person did. */
    byRef: text("by_ref"),
    addedAt: timestamp("added_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.name] })],
);

/**
 * An item's references to assets, which is also the count that decides when an
 * asset may be released. The reference exists from the moment the capture
 * commits, so a client that uploads and then crashes leaks space rather than
 * leaving a reference to a capture that never arrived.
 */
export const itemAssets = sqliteTable(
  "item_assets",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(),
    assetId: text("asset_id").notNull(),
    /** What the capture expected, so a swapped asset is caught rather than served. */
    hash: text("hash").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.slot] }),
    index("item_assets_asset").on(t.assetId),
  ],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["enrichment", "mirror"] }).notNull(),
    subject: text("subject")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    enrichment: text("enrichment"),
    attempt: integer("attempt").notNull(),
    enqueuedAt: timestamp("enqueued_at").notNull(),
  },
  (t) => [index("jobs_claimable").on(t.kind, t.enqueuedAt)],
);

/**
 * No foreign key to items, and so no cascade: purging an item does not clear
 * its log entries. Erasing the trace of what happened is a separate operation
 * from erasing the material.
 */
export const actions = sqliteTable(
  "actions",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    subject: text("subject"),
    byKind: text("by_kind", {
      enum: ["person", "provider", "source"],
    }).notNull(),
    byRef: text("by_ref"),
    at: timestamp("at").notNull(),
    detail: text("detail", { mode: "json" }).$type<JsonObject>().notNull(),
  },
  (t) => [
    index("actions_subject").on(t.subject, t.at),
    index("actions_at").on(t.at),
  ],
);

/**
 * `modified_at` must increase strictly, or a client's delta read can skip a
 * write that committed while its cursor sat on the same millisecond. The last
 * value issued is kept here rather than read back from `items`, which purge
 * would otherwise be able to lower.
 */
export const poolMeta = sqliteTable("pool_meta", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
});

export const LAST_MODIFIED_AT = "last_modified_at";
