import type { JsonSchema, JsonValue, SchemaIssue } from "../json";
import type { Page, Result, Slice } from "../result";
import type { Action } from "../domain/action-log";
import type { Asset, AssetMeta, BlobIntegrity } from "../domain/asset";
import type {
  Artifact,
  EnrichmentState,
  EnrichmentStatus,
} from "../domain/enrichment";
import type {
  AssetId,
  EnrichmentName,
  ItemId,
  LeaseId,
  ProviderName,
  SourceId,
  SuggestionId,
  SyncCursor,
  Timestamp,
} from "../domain/ids";
import type { ArchiveState, Item, ItemRecord, Tag } from "../domain/item";
import type {
  Delivery,
  DeliveryOutcome,
  DestinationDescriptor,
  RoutingRecord,
} from "../domain/routing";
import type { Suggestion, SuggestionDecision } from "../domain/suggestion";
import type { Delta, Tombstone } from "../domain/sync";
import type { ClaimRequest, Job, Lease, WorkOutcome } from "../domain/work";

export interface Clock {
  now(): Timestamp;
}

export interface IdGenerator {
  next(): string;
}

export interface SchemaValidator {
  validate(schema: JsonSchema, value: JsonValue): readonly SchemaIssue[];
}

/** Owns the asset-to-blob count. Which assets an item references is the pool store's. */
export interface AssetStore {
  store(bytes: AsyncIterable<Uint8Array>, meta: AssetMeta): Promise<Asset>;
  open(id: AssetId, signal?: AbortSignal): Promise<AsyncIterable<Uint8Array>>;
  verify(id: AssetId): Promise<BlobIntegrity>;
  release(assets: readonly AssetId[]): Promise<void>;
}

export interface MirrorWriter {
  write(
    item: Item,
    artifacts: readonly Artifact[],
    records: readonly RoutingRecord[],
  ): Promise<void>;
  remove(item: ItemId): Promise<void>;
}

export interface MirrorReader {
  items(): AsyncIterable<Item>;
  artifacts(item: ItemId): Promise<readonly Artifact[]>;
  routingRecords(item: ItemId): Promise<readonly RoutingRecord[]>;
}

export interface DestinationAdapter {
  describe(): DestinationDescriptor;
  deliver(delivery: Delivery, signal?: AbortSignal): Promise<DeliveryOutcome>;
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  run(job: Job, signal?: AbortSignal): Promise<WorkOutcome>;
}

export type Precondition =
  | { readonly kind: "is-head"; readonly item: ItemId }
  | { readonly kind: "item-absent"; readonly item: ItemId }
  | {
      readonly kind: "item-unchanged";
      readonly item: ItemId;
      readonly modifiedAt: Timestamp;
    }
  | { readonly kind: "lease-held"; readonly lease: LeaseId };

export type Command =
  | {
      readonly kind: "append-capture";
      readonly item: ItemRecord;
      readonly jobs: readonly Job[];
      /** Counted here rather than at upload, so a crash leaks space and never a reference. */
      readonly references: readonly AssetId[];
    }
  | {
      readonly kind: "append-revision";
      readonly revision: ItemRecord;
      readonly supersedes: ItemId;
      readonly jobs: readonly Job[];
      readonly references: readonly AssetId[];
    }
  | {
      readonly kind: "amend-item";
      readonly item: ItemRecord;
      readonly jobs: readonly Job[];
      readonly references: readonly AssetId[];
    }
  | {
      readonly kind: "set-tags";
      readonly item: ItemId;
      readonly tags: readonly Tag[];
    }
  | {
      readonly kind: "set-archive";
      readonly item: ItemId;
      readonly archived: ArchiveState | undefined;
    }
  | {
      readonly kind: "add-suggestions";
      readonly suggestions: readonly Suggestion[];
    }
  | {
      readonly kind: "decide-suggestion";
      readonly suggestion: SuggestionId;
      readonly decision: SuggestionDecision;
      readonly tags: readonly Tag[];
    }
  | { readonly kind: "append-routing-record"; readonly record: RoutingRecord }
  | { readonly kind: "append-artifact"; readonly artifact: Artifact }
  | {
      readonly kind: "request-enrichment";
      readonly item: ItemId;
      readonly enrichment: EnrichmentName;
      readonly jobs: readonly Job[];
    }
  | {
      readonly kind: "settle-enrichment";
      readonly lease: LeaseId;
      readonly enrichment: EnrichmentName;
      readonly state: EnrichmentState;
      readonly artifacts: readonly Artifact[];
      readonly suggestions: readonly Suggestion[];
    }
  | {
      readonly kind: "settle-mirror";
      readonly lease: LeaseId;
      readonly mirroredAt: Timestamp;
    }
  | {
      readonly kind: "purge-item";
      readonly tombstones: readonly Tombstone[];
    }
  | { readonly kind: "clear-actions"; readonly item?: ItemId };

export type Mutation = {
  readonly command: Command;
  readonly preconditions: readonly Precondition[];
  readonly actions: readonly Action[];
};

export type PreconditionFailed = {
  readonly kind: "precondition-failed";
  readonly precondition: Precondition;
};

/**
 * Deliberately partial: the read surface grows with the first implementation
 * slice rather than being guessed at in full.
 */
export interface PoolStore {
  apply(mutation: Mutation): Promise<Result<void, PreconditionFailed>>;

  item(id: ItemId): Promise<Item | undefined>;
  head(): Promise<Item | undefined>;
  itemBySourceIdentity(
    source: SourceId,
    sourceItemId: string,
  ): Promise<Item | undefined>;
  revisionChain(id: ItemId): Promise<readonly Item[]>;
  tombstone(id: ItemId): Promise<Tombstone | undefined>;

  feed(page: Page): Promise<Slice<Item>>;
  queue(page: Page): Promise<Slice<Item>>;
  archived(page: Page): Promise<Slice<Item>>;

  suggestions(item: ItemId): Promise<readonly Suggestion[]>;
  suggestion(id: SuggestionId): Promise<Suggestion | undefined>;
  routingRecords(item: ItemId): Promise<readonly RoutingRecord[]>;
  artifacts(item: ItemId): Promise<readonly Artifact[]>;
  enrichmentStates(item: ItemId): Promise<readonly EnrichmentStatus[]>;
  abandonedEnrichments(page: Page): Promise<Slice<EnrichmentStatus>>;

  /** The pool store owns the item-to-asset count, so only it can find these. */
  unreferencedAssets(
    olderThan: Timestamp,
    limit: number,
  ): Promise<readonly AssetId[]>;

  actions(item: ItemId | undefined, page: Page): Promise<Slice<Action>>;
  changesSince(cursor: SyncCursor | undefined, limit: number): Promise<Delta>;

  claim(request: ClaimRequest, now: Timestamp): Promise<readonly Lease[]>;
  extendLease(
    lease: LeaseId,
    until: Timestamp,
  ): Promise<Result<Lease, PreconditionFailed>>;
  releaseLease(lease: LeaseId): Promise<void>;
}
