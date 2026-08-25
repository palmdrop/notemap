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
export type DestinationKindName = Branded<string, "DestinationKindName">;
export type CapabilityName = Branded<string, "CapabilityName">;
export type PayloadTypeName = Branded<string, "PayloadTypeName">;
export type RoutingRecordId = Branded<string, "RoutingRecordId">;
export type JobId = Branded<string, "JobId">;
export type LeaseId = Branded<string, "LeaseId">;
export type ActionId = Branded<string, "ActionId">;
export type SyncCursor = Branded<string, "SyncCursor">;

/**
 * Which pool this is, minted once and stable for as long as that pool exists.
 * A rebuild makes a new pool and so takes a new one, which is how a client
 * that cached one learns that everything it holds describes somewhere else.
 */
export type PoolIdentity = Branded<string, "PoolIdentity">;

/**
 * The brands a generator may mint: fresh identities for things that are
 * created. Everything else is excluded because it comes from somewhere — a
 * hash from content, a source or provider name from configuration, a
 * timestamp from the clock, a cursor or a pool identity from the store — and
 * minting one would fabricate a fact.
 */
export type MintableId =
  | ItemId
  | AssetId
  | DestinationId
  | SuggestionId
  | ArtifactId
  | RoutingRecordId
  | JobId
  | LeaseId
  | ActionId;

/** RFC 3339, always UTC. */
export type Timestamp = Branded<string, "Timestamp">;

/** Milliseconds. */
export type Duration = Branded<number, "Duration">;
