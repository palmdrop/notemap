import type {
  Action,
  ActionId,
  ActionKind,
  Agent,
  AssetId,
  AssetRef,
  BlobHash,
  Item,
  ItemId,
  PayloadTypeName,
  ProviderName,
  SourceId,
  TagName,
  Timestamp,
} from "@notemap/core";

import type { actions, itemAssets, items, itemTags } from "./schema";

export type ItemRow = typeof items.$inferSelect;
export type TagRow = typeof itemTags.$inferSelect;
export type AssetRow = typeof itemAssets.$inferSelect;
export type ActionRow = typeof actions.$inferSelect;

type AgentColumns = {
  readonly byKind: "person" | "provider" | "source";
  readonly byRef: string | null;
};

export function toMillis(value: Timestamp): number {
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) {
    throw new TypeError(`not a parseable timestamp: ${value}`);
  }
  return millis;
}

export function toTimestamp(millis: number): Timestamp {
  return new Date(millis).toISOString() as Timestamp;
}

export function agentColumns(agent: Agent): AgentColumns {
  switch (agent.kind) {
    case "person":
      return { byKind: "person", byRef: null };
    case "provider":
      return { byKind: "provider", byRef: agent.provider };
    case "source":
      return { byKind: "source", byRef: agent.source };
  }
}

function toAgent(row: AgentColumns): Agent {
  switch (row.byKind) {
    case "person":
      return { kind: "person" };
    case "provider":
      return { kind: "provider", provider: row.byRef as ProviderName };
    case "source":
      return { kind: "source", source: row.byRef as SourceId };
  }
}

export function toItem(
  row: ItemRow,
  tagRows: readonly TagRow[],
  assetRows: readonly AssetRow[],
  supersededBy: string | undefined,
): Item {
  const assets: AssetRef[] = assetRows.map((asset) => ({
    slot: asset.slot,
    asset: asset.assetId as AssetId,
    hash: asset.hash as BlobHash,
  }));

  return {
    id: row.id as ItemId,
    source: row.sourceId as SourceId,
    sourceItemId: row.sourceItemId,
    payload: {
      type: row.payloadType as PayloadTypeName,
      content: row.payloadContent,
      metadata: row.payloadMetadata,
      assets,
    },
    tags: tagRows.map((tag) => ({
      name: tag.name as TagName,
      by: toAgent(tag),
      addedAt: toTimestamp(tag.addedAt),
    })),
    createdAt: toTimestamp(row.createdAt),
    ...(row.contentUpdatedAt === null
      ? {}
      : { contentUpdatedAt: toTimestamp(row.contentUpdatedAt) }),
    ...(row.revisionOf === null
      ? {}
      : { revisionOf: row.revisionOf as ItemId }),
    ...(row.archivedAt === null
      ? {}
      : {
          archived: {
            archivedAt: toTimestamp(row.archivedAt),
            ...(row.archiveReason === null
              ? {}
              : { reason: row.archiveReason }),
          },
        }),
    modifiedAt: toTimestamp(row.modifiedAt),
    ...(supersededBy === undefined
      ? {}
      : { supersededBy: supersededBy as ItemId }),
  };
}

export function toAction(row: ActionRow): Action {
  return {
    id: row.id as ActionId,
    kind: row.kind as ActionKind,
    ...(row.subject === null ? {} : { subject: row.subject as ItemId }),
    by: toAgent(row),
    at: toTimestamp(row.at),
    detail: row.detail,
  };
}
