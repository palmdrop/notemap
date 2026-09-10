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
  /** Minutes east of UTC where the capture was made, where it knew. */
  readonly utc_offset: number | null;
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

/**
 * An item's reference to an asset, joined to the asset it names. The foreign
 * key makes the join total, so a reference can never resolve to nothing.
 */
export type ItemAssetJoinRow = ItemAssetRow &
  Omit<AssetRow, "id" | "stored_at">;

export type AssetRow = {
  readonly id: string;
  readonly filename: string;
  readonly mime: string;
  readonly blob: string;
  readonly bytes: number;
  readonly stored_at: number;
};

export type SourceUseRow = {
  readonly source_id: string;
  readonly items: number;
  readonly last_captured_at: number;
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

export type RoutingTemplateRow = {
  readonly id: string;
  readonly name: string;
  readonly destination_id: string;
  readonly capability: string;
  /** JSON: the arguments as patterns, expanded only when a decision is made. */
  readonly arguments: string;
  readonly folder: "create" | "require" | "establish";
  readonly trigger_tag: string | null;
  readonly established_at: number | null;
  readonly created_at: number;
  readonly modified_at: number;
  /** Derived, on the terms an item's routing summary is: what records name it. */
  readonly fired_records: number;
  readonly fired_last_at: number | null;
};

export type JobRow = {
  readonly id: string;
  readonly kind: "enrichment" | "mirror" | "mirror-remove" | "delivery";
  readonly subject_kind: "item" | "routing-record" | "destination" | "template";
  readonly subject_id: string;
  /**
   * The capture the work concerns, which outlives a subject that may be
   * removed. Null for work about no capture at all, which a destination's or a
   * template's mirror write is.
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
  /** JSON, and only for a destination: the rewrite the decision was made with, where it carried one. */
  readonly content: string | null;
  readonly state: "pending" | "delivered";
  readonly at: number;
  readonly pointer: string | null;
  /** A link to what the pointer names, where the destination could offer one. */
  readonly url: string | null;
  /** The blob holding what the delivery produced, and what those bytes are. */
  readonly output_blob: string | null;
  readonly output_mime: string | null;
  /** Prose about what the delivery could not carry, and never `note`, which is a person's own word. */
  readonly output_note: string | null;
  /** The template the decision came from, which may since have been deleted. */
  readonly template_id: string | null;
  readonly fired_by_tag: number | null;
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
    "utc_offset",
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
  routing_templates: [
    "id",
    "name",
    "destination_id",
    "capability",
    "arguments",
    "folder",
    "trigger_tag",
    "established_at",
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
    "content",
    "destination",
    "capability",
    "note",
    "arguments",
    "state",
    "at",
    "pointer",
    "url",
    "output_blob",
    "output_mime",
    "output_note",
    "template_id",
    "fired_by_tag",
  ],
  actions: ["id", "kind", "subject", "by_kind", "by_ref", "at", "detail"],
  pool_meta: ["key", "value"],
  pool_identity: ["singleton", "identity"],
} as const satisfies Record<string, readonly string[]>;
