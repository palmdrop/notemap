import type {
  Action,
  ActionId,
  ActionKind,
  Agent,
  Asset,
  AssetId,
  AssetRef,
  BlobHash,
  CapabilityName,
  Destination,
  DestinationId,
  DestinationKindName,
  DestinationRecord,
  EnrichmentName,
  Item,
  ItemId,
  ItemRecord,
  Job,
  JobId,
  JobSubject,
  JsonObject,
  PayloadTypeName,
  ProviderName,
  RoutedTo,
  RoutingRecord,
  RoutingRecordId,
  RoutingSummary,
  RoutingTarget,
  RoutingTemplate,
  RoutingTemplateId,
  RoutingTemplateRecord,
  SourceId,
  StoredOutput,
  TagName,
  Timestamp,
} from "@notemap/core";

import type {
  ActionRow,
  AgentColumns,
  AssetRow,
  DestinationRow,
  ItemAssetRow,
  ItemRow,
  ItemRoutingRow,
  ItemTagRow,
  JobRow,
  RoutingRecordRow,
  RoutingTemplateRow,
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

export function toRoutingSummary(
  rows: readonly ItemRoutingRow[],
): RoutingSummary | undefined {
  if (rows.length === 0) return undefined;

  const to = new Map<string, RoutedTo>();
  for (const row of rows) {
    const went: RoutedTo =
      row.target_kind === "destination"
        ? { kind: "destination", destination: row.destination as DestinationId }
        : { kind: "user" };
    const key = went.kind === "user" ? "user" : went.destination;
    if (!to.has(key)) to.set(key, went);
  }

  return {
    records: rows.length,
    pending: rows.filter((row) => row.state === "pending").length,
    to: [...to.values()],
  };
}

export function toItem(
  row: ItemRow,
  tagRows: readonly ItemTagRow[],
  assetRows: readonly ItemAssetRow[],
  revisedInto: readonly string[],
  routing: RoutingSummary | undefined,
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
    revisedInto: revisedInto as readonly ItemId[],
    ...(routing === undefined ? {} : { routing }),
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

export function toJobSubject(
  row: Pick<JobRow, "subject_kind" | "subject_id">,
): JobSubject {
  switch (row.subject_kind) {
    case "item":
      return { kind: "item", item: row.subject_id as ItemId };
    case "routing-record":
      return {
        kind: "routing-record",
        record: row.subject_id as RoutingRecordId,
      };
    case "template":
      return {
        kind: "template",
        template: row.subject_id as RoutingTemplateId,
      };
    case "destination":
      return {
        kind: "destination",
        destination: row.subject_id as DestinationId,
      };
  }
}

/** The pair a subject is stored as, in the order every statement binds them. */
export function subjectColumns(
  subject: JobSubject,
): [JobRow["subject_kind"], string] {
  switch (subject.kind) {
    case "item":
      return ["item", subject.item];
    case "routing-record":
      return ["routing-record", subject.record];
    case "template":
      return ["template", subject.template];
    case "destination":
      return ["destination", subject.destination];
  }
}

export function toJob(row: JobRow): Job {
  return {
    id: row.id as JobId,
    kind: row.kind,
    subject: toJobSubject(row),
    ...(row.enrichment === null
      ? {}
      : { enrichment: row.enrichment as EnrichmentName }),
    attempt: row.attempt,
    enqueuedAt: toTimestamp(row.enqueued_at),
  };
}

export function toRoutingRecord(row: RoutingRecordRow): RoutingRecord {
  return {
    id: row.id as RoutingRecordId,
    item: row.item_id as ItemId,
    target: toRoutingTarget(row),
    state: row.state,
    at: toTimestamp(row.at),
    ...(row.template_id === null
      ? {}
      : {
          applied: {
            template: row.template_id as RoutingTemplateId,
            firedByTag: row.fired_by_tag === 1,
          },
        }),
    ...(row.pointer === null ? {} : { pointer: row.pointer }),
    ...(row.url === null ? {} : { url: row.url }),
    ...toOutput(row),
  };
}

/** The pairing of blob and media type is the schema's; a record with neither and no note has no output. */
function toOutput(row: RoutingRecordRow): { output?: StoredOutput } {
  const content =
    row.output_blob === null || row.output_mime === null
      ? undefined
      : { blob: row.output_blob as BlobHash, mediaType: row.output_mime };

  if (content === undefined && row.output_note === null) return {};

  return {
    output: {
      ...(content === undefined ? {} : { content }),
      ...(row.output_note === null ? {} : { note: row.output_note }),
    },
  };
}

function toRoutingTarget(row: RoutingRecordRow): RoutingTarget {
  if (row.target_kind === "user") {
    return { kind: "user", ...(row.note === null ? {} : { note: row.note }) };
  }

  return {
    kind: "destination",
    destination: row.destination as DestinationId,
    capability: row.capability as CapabilityName,
    arguments: parseJson(row.arguments ?? "{}"),
  };
}

/** The bound parameters for inserting a routing record, in the order the statement declares. */
export function routingRecordParams(
  record: RoutingRecord,
): [
  string,
  string,
  RoutingRecordRow["target_kind"],
  string | null,
  string | null,
  string | null,
  string | null,
  RoutingRecordRow["state"],
  number,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  number | null,
] {
  const target = record.target;
  const output = record.output;

  return [
    record.id,
    record.item,
    target.kind,
    target.kind === "destination" ? target.destination : null,
    target.kind === "destination" ? target.capability : null,
    target.kind === "user" ? (target.note ?? null) : null,
    target.kind === "destination" ? JSON.stringify(target.arguments) : null,
    record.state,
    toMillis(record.at),
    record.pointer ?? null,
    record.url ?? null,
    output?.content?.blob ?? null,
    output?.content?.mediaType ?? null,
    output?.note ?? null,
    record.applied?.template ?? null,
    record.applied === undefined ? null : record.applied.firedByTag ? 1 : 0,
  ];
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

export function toRoutingTemplate(row: RoutingTemplateRow): RoutingTemplate {
  return {
    id: row.id as RoutingTemplateId,
    name: row.name,
    destination: row.destination_id as DestinationId,
    capability: row.capability as CapabilityName,
    arguments: parseJson(row.arguments),
    folder: row.folder,
    ...(row.trigger_tag === null
      ? {}
      : { triggerTag: row.trigger_tag as TagName }),
    ...(row.established_at === null
      ? {}
      : { establishedAt: toTimestamp(row.established_at) }),
    createdAt: toTimestamp(row.created_at),
    modifiedAt: toTimestamp(row.modified_at),
  };
}

/** The bound parameters for writing a template, in the order the statements declare. */
export function routingTemplateParams(
  record: RoutingTemplateRecord,
  modifiedAt: number,
): [
  string,
  string,
  string,
  string,
  string,
  RoutingTemplateRow["folder"],
  string | null,
  number | null,
  number,
  number,
] {
  return [
    record.id,
    record.name,
    record.destination,
    record.capability,
    JSON.stringify(record.arguments),
    record.folder,
    record.triggerTag ?? null,
    record.establishedAt === undefined ? null : toMillis(record.establishedAt),
    toMillis(record.createdAt),
    modifiedAt,
  ];
}

export function toDestination(row: DestinationRow): Destination {
  return {
    id: row.id as DestinationId,
    name: row.name,
    kind: row.kind as DestinationKindName,
    settings: parseJson(row.settings),
    ...(row.retired_at === null
      ? {}
      : { retiredAt: toTimestamp(row.retired_at) }),
    createdAt: toTimestamp(row.created_at),
    modifiedAt: toTimestamp(row.modified_at),
  };
}

/** The bound parameters for writing a destination, in the order the statements declare. */
export function destinationParams(
  record: DestinationRecord,
  modifiedAt: number,
): [string, string, string, string, number | null, number, number] {
  return [
    record.id,
    record.name,
    record.kind,
    JSON.stringify(record.settings),
    record.retiredAt === undefined ? null : toMillis(record.retiredAt),
    toMillis(record.createdAt),
    modifiedAt,
  ];
}
