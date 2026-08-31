/**
 * The shape of every table, as SQLite hands it back — the one place the driver
 * asserts rather than checks. `schema.test.ts` closes the gap from the other
 * end, failing if these and the migrations disagree on any column.
 */

export type AgentColumns = {
  readonly by_kind: "notemap" | "person" | "provider" | "source";
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
};

export type AssetRow = {
  readonly id: string;
  readonly filename: string;
  readonly mime: string;
  readonly blob: string;
  readonly bytes: number;
  readonly stored_at: number;
};

export type DestinationRow = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  /** JSON, and the kind's own: the driver never looks inside it. */
  readonly settings: string;
  readonly retired_at: number | null;
  readonly created_at: number;
  readonly modified_at: number;
};

export type JobRow = {
  readonly id: string;
  readonly kind: "enrichment" | "mirror" | "mirror-remove" | "delivery";
  readonly subject_kind: "item" | "routing-record" | "destination";
  readonly subject_id: string;
  /**
   * The capture the work concerns, which outlives a subject that may be
   * removed. Null for work about no capture at all, which a destination's
   * mirror write is.
   */
  readonly subject_item: string | null;
  readonly enrichment: string | null;
  readonly attempt: number;
  readonly enqueued_at: number;
  readonly next_attempt_at: number;
  readonly lease_id: string | null;
  readonly lease_expires_at: number | null;
  readonly abandoned_at: number | null;
  readonly last_failure_code: string | null;
  readonly last_failure_detail: string | null;
};

export type RoutingRecordRow = {
  readonly id: string;
  readonly item_id: string;
  readonly target_kind: "destination" | "user";
  readonly destination: string | null;
  readonly capability: string | null;
  readonly note: string | null;
  /** JSON, and only for a destination: what the capability was pointed at. */
  readonly arguments: string | null;
  readonly state: "pending" | "delivered";
  readonly at: number;
  readonly pointer: string | null;
};

/** What a page needs of an item's routing records, without their targets. */
export type ItemRoutingRow = {
  readonly item_id: string;
  readonly target_kind: "destination" | "user";
  readonly destination: string | null;
  readonly state: "pending" | "delivered";
};

export type TagUseRow = {
  readonly name: string;
  readonly items: number;
};

export type ActionRow = AgentColumns & {
  readonly id: string;
  readonly kind: string;
  readonly subject: string | null;
  readonly at: number;
  readonly detail: string;
};

export type PoolIdentityRow = {
  readonly singleton: number;
  readonly identity: string;
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
  item_assets: ["item_id", "slot", "asset_id"],
  assets: ["id", "filename", "mime", "blob", "bytes", "stored_at"],
  destinations: [
    "id",
    "name",
    "kind",
    "settings",
    "retired_at",
    "created_at",
    "modified_at",
  ],
  jobs: [
    "id",
    "kind",
    "subject_kind",
    "subject_id",
    "subject_item",
    "enrichment",
    "attempt",
    "enqueued_at",
    "next_attempt_at",
    "lease_id",
    "lease_expires_at",
    "abandoned_at",
    "last_failure_code",
    "last_failure_detail",
  ],
  routing_records: [
    "id",
    "item_id",
    "target_kind",
    "destination",
    "capability",
    "note",
    "arguments",
    "state",
    "at",
    "pointer",
  ],
  actions: ["id", "kind", "subject", "by_kind", "by_ref", "at", "detail"],
  pool_meta: ["key", "value"],
  pool_identity: ["singleton", "identity"],
} as const satisfies Record<string, readonly string[]>;
