import type { JsonSchema, JsonValue, SchemaIssue } from "../json";
import type { FeedPage, Page, Result, Slice } from "../result";
import type { Action } from "../domain/action-log";
import type { Asset, AssetMeta, BlobIntegrity } from "../domain/asset";
import type { Artifact, EnrichmentStatus } from "../domain/enrichment";
import type {
  AssetId,
  ItemId,
  LeaseId,
  ProviderName,
  SourceId,
  SuggestionId,
  SyncCursor,
  Timestamp,
} from "../domain/ids";
import type { Item, ItemRecord } from "../domain/item";
import type {
  Delivery,
  DeliveryOutcome,
  DestinationDescriptor,
  RoutingRecord,
} from "../domain/routing";
import type { Suggestion } from "../domain/suggestion";
import type { Delta, Tombstone } from "../domain/sync";
import type { ClaimRequest, Job, Lease, WorkOutcome } from "../domain/work";
import type { LeaseRefusal } from "./refusal";

/** Everything a pool reaches the outside world through. Core sources none of it. */
export type PoolPorts = {
  readonly store: PoolStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly schemas: SchemaValidator;
  readonly assets: AssetStore;
  readonly mirrorWriter: MirrorWriter;
  readonly mirrorReader: MirrorReader;
  readonly destinations: readonly DestinationAdapter[];
};

export interface Clock {
  now(): Timestamp;
}

export interface IdGenerator {
  next<T extends string>(): T;
}

export interface SchemaValidator {
  validate(schema: JsonSchema, value: JsonValue): readonly SchemaIssue[];
}

/** Owns the asset-to-blob count. Which assets an item references is the pool store's. */
export interface AssetStore {
  store(bytes: AsyncIterable<Uint8Array>, meta: AssetMeta): Promise<Asset>;
  /**
   * Resolves a reference before the capture carrying it commits: without this
   * core cannot tell an unknown asset from one whose blob has been swapped
   * underneath it, and both are refusals it is meant to raise.
   */
  get(id: AssetId): Promise<Asset | undefined>;
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

/**
 * Deliberately partial: the surface grows one implementation slice at a time
 * rather than being guessed at in full.
 */
export interface PoolReads {
  item(id: ItemId): Promise<Item | undefined>;
  head(): Promise<Item | undefined>;
  itemBySourceIdentity(
    source: SourceId,
    sourceItemId: string,
  ): Promise<Item | undefined>;
  revisionChain(id: ItemId): Promise<readonly Item[]>;
  tombstone(id: ItemId): Promise<Tombstone | undefined>;

  feed(page: FeedPage): Promise<Slice<Item>>;
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
}

/**
 * Reads and writes inside one transaction. A precondition is an ordinary read
 * here — an amendment checks that its item is still the head, and demotes
 * itself to a revision when it is not — so nothing has to be asserted up front.
 *
 * Which assets an item references is not passed to `insertItem`: the store
 * takes it from the payload, so the count and the payload cannot disagree.
 */
export interface PoolTx extends PoolReads {
  insertItem(record: ItemRecord): Promise<Item>;
  appendAction(action: Action): Promise<void>;
  enqueue(jobs: readonly Job[]): Promise<void>;
}

export interface PoolStore extends PoolReads {
  /**
   * Applies `work` all-or-nothing: the store commits what it wrote when the
   * promise resolves and discards it when the promise rejects.
   *
   * **Core performs no outside I/O in here.** Every port is async and the store
   * holds a write lock for as long as `work` runs, so awaiting an asset store, a
   * provider or a destination inside a transaction stalls the pool. Validate,
   * fetch and hash first, then open the transaction. This is a design rule
   * review defends rather than one the types enforce — a synchronous callback
   * would enforce it, at the price of ever supporting an asynchronous store.
   */
  transaction<T>(work: (tx: PoolTx) => Promise<T>): Promise<T>;

  claim(request: ClaimRequest, now: Timestamp): Promise<readonly Lease[]>;
  extendLease(
    lease: LeaseId,
    until: Timestamp,
  ): Promise<Result<Lease, LeaseRefusal>>;
  releaseLease(lease: LeaseId): Promise<void>;

  /**
   * Releases whatever the store holds open. Declared on every store even where
   * one has nothing to release, so a host disposing a pool never has to ask
   * which kind of store it wired.
   */
  close(): Promise<void>;
}
