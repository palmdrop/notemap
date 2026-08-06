/**
 * The shape of every table, as SQLite hands it back.
 *
 * Hand-written SQL cannot prove a row matches its type, so these are the one
 * place the driver asserts rather than checks. `schema.test.ts` closes the gap
 * from the other end: it reads `PRAGMA table_info` and fails if a column here
 * has no counterpart in the migration, or the other way round.
 */

export type AgentColumns = {
  readonly by_kind: "person" | "provider" | "source";
  readonly by_ref: string | null;
};

export type ItemRow = {
  readonly id: string;
  readonly source_id: string;
  readonly source_item_id: string;
  readonly payload_type: string;
  readonly payload_content: string;
  readonly payload_metadata: string;
  readonly created_at: number;
  readonly content_updated_at: number | null;
  readonly modified_at: number;
  readonly revision_of: string | null;
  readonly archived_at: number | null;
  readonly archive_reason: string | null;
};

export type ItemTagRow = AgentColumns & {
  readonly item_id: string;
  readonly name: string;
  readonly added_at: number;
};

export type ItemAssetRow = {
  readonly item_id: string;
  readonly slot: string;
  readonly asset_id: string;
  readonly hash: string;
};

export type JobRow = {
  readonly id: string;
  readonly kind: "enrichment" | "mirror";
  readonly subject: string;
  readonly enrichment: string | null;
  readonly attempt: number;
  readonly enqueued_at: number;
};

export type ActionRow = AgentColumns & {
  readonly id: string;
  readonly kind: string;
  readonly subject: string | null;
  readonly at: number;
  readonly detail: string;
};

export type PoolMetaRow = {
  readonly key: string;
  readonly value: number;
};

/** Every table the migrations create, and the type each row is read as. */
export const TABLE_COLUMNS = {
  items: [
    "id",
    "source_id",
    "source_item_id",
    "payload_type",
    "payload_content",
    "payload_metadata",
    "created_at",
    "content_updated_at",
    "modified_at",
    "revision_of",
    "archived_at",
    "archive_reason",
  ],
  item_tags: ["item_id", "name", "by_kind", "by_ref", "added_at"],
  item_assets: ["item_id", "slot", "asset_id", "hash"],
  jobs: ["id", "kind", "subject", "enrichment", "attempt", "enqueued_at"],
  actions: ["id", "kind", "subject", "by_kind", "by_ref", "at", "detail"],
  pool_meta: ["key", "value"],
} as const satisfies Record<string, readonly string[]>;
