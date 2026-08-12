import type {
  Action,
  ActionId,
  ActionKind,
  Agent,
  Asset,
  AssetId,
  AssetRef,
  BlobHash,
  EnrichmentName,
  Item,
  ItemId,
  ItemRecord,
  Job,
  JobId,
  JsonObject,
  PayloadTypeName,
  ProviderName,
  SourceId,
  TagName,
  Timestamp,
} from "@notemap/core";

import type {
  ActionRow,
  AgentColumns,
  AssetRow,
  ItemAssetRow,
  ItemRow,
  ItemTagRow,
  JobRow,
} from "./rows";

export function toMillis(value: Timestamp): number {
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) {
    throw new TypeError(`not a parseable timestamp: ${value}`);
  }
  return millis;
}

/** The canonical spelling, whatever the source wrote: a timestamp round-trips instant for instant, not byte for byte. */
export function toTimestamp(millis: number): Timestamp {
  return new Date(millis).toISOString() as Timestamp;
}

export function agentColumns(
  agent: Agent,
): [AgentColumns["by_kind"], string | null] {
  switch (agent.kind) {
    case "notemap":
      return ["notemap", null];
    case "person":
      return ["person", null];
    case "provider":
      return ["provider", agent.provider];
    case "source":
      return ["source", agent.source];
  }
}

function toAgent(row: AgentColumns): Agent {
  switch (row.by_kind) {
    case "notemap":
      return { kind: "notemap" };
    case "person":
      return { kind: "person" };
    case "provider":
      return { kind: "provider", provider: row.by_ref as ProviderName };
    case "source":
      return { kind: "source", source: row.by_ref as SourceId };
  }
}

function parseJson(value: string): JsonObject {
  return JSON.parse(value) as JsonObject;
}

export function toItem(
  row: ItemRow,
  tagRows: readonly ItemTagRow[],
  assetRows: readonly ItemAssetRow[],
  supersededBy: string | undefined,
): Item {
  const assets: AssetRef[] = assetRows.map((asset) => ({
    slot: asset.slot,
    asset: asset.asset_id as AssetId,
  }));

  return {
    id: row.id as ItemId,
    source: row.source_id as SourceId,
    sourceItemId: row.source_item_id,
    payload: {
      type: row.payload_type as PayloadTypeName,
      content: parseJson(row.payload_content),
      metadata: parseJson(row.payload_metadata),
      assets,
    },
    tags: tagRows.map((tag) => ({
      name: tag.name as TagName,
      by: toAgent(tag),
      addedAt: toTimestamp(tag.added_at),
    })),
    createdAt: toTimestamp(row.created_at),
    ...(row.content_updated_at === null
      ? {}
      : { contentUpdatedAt: toTimestamp(row.content_updated_at) }),
    ...(row.revision_of === null
      ? {}
      : { revisionOf: row.revision_of as ItemId }),
    ...(row.archived_at === null
      ? {}
      : {
          archived: {
            archivedAt: toTimestamp(row.archived_at),
            ...(row.archive_reason === null
              ? {}
              : { reason: row.archive_reason }),
          },
        }),
    modifiedAt: toTimestamp(row.modified_at),
    ...(supersededBy === undefined
      ? {}
      : { supersededBy: supersededBy as ItemId }),
  };
}

/** The bound parameters for inserting an item, in the order the statement declares. */
export function itemParams(
  record: ItemRecord,
  modifiedAt: number,
): [
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  number | null,
  number,
  string | null,
  number | null,
  string | null,
] {
  return [
    record.id,
    record.source,
    record.sourceItemId,
    record.payload.type,
    JSON.stringify(record.payload.content),
    JSON.stringify(record.payload.metadata),
    toMillis(record.createdAt),
    record.contentUpdatedAt === undefined
      ? null
      : toMillis(record.contentUpdatedAt),
    modifiedAt,
    record.revisionOf ?? null,
    record.archived === undefined ? null : toMillis(record.archived.archivedAt),
    record.archived?.reason ?? null,
  ];
}

export function toAsset(row: AssetRow): Asset {
  return {
    id: row.id as AssetId,
    filename: row.filename,
    mime: row.mime,
    blob: row.blob as BlobHash,
    bytes: row.bytes,
  };
}

export function toJob(row: JobRow): Job {
  return {
    id: row.id as JobId,
    kind: row.kind,
    subject: row.subject as ItemId,
    ...(row.enrichment === null
      ? {}
      : { enrichment: row.enrichment as EnrichmentName }),
    attempt: row.attempt,
    enqueuedAt: toTimestamp(row.enqueued_at),
  };
}

export function toAction(row: ActionRow): Action {
  return {
    id: row.id as ActionId,
    kind: row.kind as ActionKind,
    ...(row.subject === null ? {} : { subject: row.subject as ItemId }),
    by: toAgent(row),
    at: toTimestamp(row.at),
    detail: parseJson(row.detail),
  };
}
