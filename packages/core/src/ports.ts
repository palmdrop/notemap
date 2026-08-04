import type { Action } from "./action-log.js";
import type { Asset, AssetMeta, BlobIntegrity } from "./asset.js";
import type { Artifact, EnrichmentState } from "./enrichment.js";
import type {
  AssetId,
  ItemId,
  JsonSchema,
  JsonValue,
  LeaseId,
  ProviderName,
  SchemaIssue,
  SuggestionId,
  Timestamp,
} from "./ids.js";
import type { ArchiveState, Item, Tag } from "./item.js";
import type { Page, Slice } from "./paging.js";
import type { Result } from "./result.js";
import type {
  Delivery,
  DeliveryOutcome,
  DestinationDescriptor,
  RoutingRecord,
} from "./routing.js";
import type { SuggestionDecision } from "./suggestion.js";
import type { Delta, SyncCursor, Tombstone } from "./sync.js";
import type { ClaimRequest, Job, Lease, WorkOutcome } from "./work.js";

export interface Clock {
  now(): Timestamp;
}

export interface IdGenerator {
  /** Time-ordered, so ids sort by when they were minted. */
  next(): string;
}

export interface SchemaValidator {
  validate(schema: JsonSchema, value: JsonValue): readonly SchemaIssue[];
}

export interface AssetStore {
  /**
   * Deduplicates on content: identical bytes reuse the existing blob. The
   * returned asset always carries the filename it was given.
   */
  store(bytes: AsyncIterable<Uint8Array>, meta: AssetMeta): Promise<Asset>;
  open(id: AssetId, signal?: AbortSignal): Promise<AsyncIterable<Uint8Array>>;
  verify(id: AssetId): Promise<BlobIntegrity>;
  release(assets: readonly AssetId[]): Promise<void>;
  sweepUnreferenced(olderThan: Timestamp): Promise<readonly AssetId[]>;
}

export interface MirrorWriter {
  write(
    item: Item,
    artifacts: readonly Artifact[],
    records: readonly RoutingRecord[],
  ): Promise<void>;
  remove(item: ItemId): Promise<void>;
}

export interface DestinationAdapter {
  describe(): DestinationDescriptor;
  deliver(delivery: Delivery, signal?: AbortSignal): Promise<DeliveryOutcome>;
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  run(job: Job, signal?: AbortSignal): Promise<WorkOutcome>;
}

/**
 * Preconditions are what make read-modify-write safe without core holding a
 * lock: the store refuses a mutation whose precondition no longer holds, and
 * the caller re-decides from the current state.
 */
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
      readonly item: Item;
      readonly jobs: readonly Job[];
      /** Taken here rather than when the bytes were stored, so a crash leaks space, not a reference. */
      readonly references: readonly AssetId[];
    }
  | {
      readonly kind: "append-revision";
      readonly revision: Item;
      readonly supersedes: ItemId;
      readonly jobs: readonly Job[];
      readonly references: readonly AssetId[];
    }
  | {
      readonly kind: "amend-item";
      readonly item: Item;
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
      readonly kind: "decide-suggestion";
      readonly suggestion: SuggestionId;
      readonly decision: SuggestionDecision;
      readonly tags: readonly Tag[];
    }
  | { readonly kind: "append-routing-record"; readonly record: RoutingRecord }
  | { readonly kind: "append-artifact"; readonly artifact: Artifact }
  | {
      readonly kind: "settle-work";
      readonly lease: LeaseId;
      readonly state: EnrichmentState;
      readonly artifacts: readonly Artifact[];
    }
  | {
      readonly kind: "purge-item";
      readonly item: ItemId;
      readonly tombstone: Tombstone;
      readonly release: readonly AssetId[];
    }
  | { readonly kind: "clear-actions"; readonly item?: ItemId };

/**
 * One domain operation, applied all-or-nothing. Core never holds a
 * transaction handle, which is also why it can perform no I/O mid-write.
 */
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
 * Reads are asked for in domain terms; how the store answers them, and what
 * it materializes to do so, is its own business.
 *
 * Deliberately partial — the read surface grows with the first implementation
 * slice rather than being guessed at in full here.
 */
export interface PoolStore {
  apply(mutation: Mutation): Promise<Result<void, PreconditionFailed>>;

  item(id: ItemId): Promise<Item | undefined>;
  head(): Promise<Item | undefined>;
  itemBySourceIdentity(
    source: string,
    sourceItemId: string,
  ): Promise<Item | undefined>;
  tombstone(id: ItemId): Promise<Tombstone | undefined>;

  feed(page: Page): Promise<Slice<Item>>;
  queue(page: Page): Promise<Slice<Item>>;
  archived(page: Page): Promise<Slice<Item>>;

  routingRecords(item: ItemId): Promise<readonly RoutingRecord[]>;
  artifacts(item: ItemId): Promise<readonly Artifact[]>;

  actions(item: ItemId | undefined, page: Page): Promise<Slice<Action>>;
  changesSince(cursor: SyncCursor | undefined, limit: number): Promise<Delta>;

  claim(request: ClaimRequest, now: Timestamp): Promise<readonly Lease[]>;
  extendLease(
    lease: LeaseId,
    until: Timestamp,
  ): Promise<Result<Lease, PreconditionFailed>>;
  releaseLease(lease: LeaseId): Promise<void>;
}
