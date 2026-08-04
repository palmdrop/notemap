import type { Branded } from "../branded";

export type ItemId = Branded<string, "ItemId">;
export type SourceId = Branded<string, "SourceId">;
export type AssetId = Branded<string, "AssetId">;
export type BlobHash = Branded<string, "BlobHash">;
export type TagName = Branded<string, "TagName">;
export type SuggestionId = Branded<string, "SuggestionId">;
export type ArtifactId = Branded<string, "ArtifactId">;
export type EnrichmentName = Branded<string, "EnrichmentName">;
export type ProviderName = Branded<string, "ProviderName">;
export type DestinationId = Branded<string, "DestinationId">;
export type CapabilityName = Branded<string, "CapabilityName">;
export type PayloadTypeName = Branded<string, "PayloadTypeName">;
export type RoutingRecordId = Branded<string, "RoutingRecordId">;
export type JobId = Branded<string, "JobId">;
export type LeaseId = Branded<string, "LeaseId">;
export type ActionId = Branded<string, "ActionId">;
export type SyncCursor = Branded<string, "SyncCursor">;

/** RFC 3339, always UTC. */
export type Timestamp = Branded<string, "Timestamp">;

/** Milliseconds. */
export type Duration = Branded<number, "Duration">;
