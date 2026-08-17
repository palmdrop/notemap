import type { JsonSchema, JsonValue, SchemaIssue } from "../json";
import type { OrderedPage, Page, Result, Slice } from "../result";
import type { Action, ActionQuery } from "../domain/action-log";
import type { Asset, BlobIntegrity, StoredBlob } from "../domain/asset";
import type { Artifact, EnrichmentStatus } from "../domain/enrichment";
import type {
  AssetId,
  BlobHash,
  DestinationId,
  ItemId,
  LeaseId,
  MintableId,
  ProviderName,
  RoutingRecordId,
  SourceId,
  SuggestionId,
  SyncCursor,
  Timestamp,
} from "../domain/ids";
import type { ArchiveState, Item, ItemRecord } from "../domain/item";
import type { MirrorRecord } from "../domain/mirror";
import type { AbandonedPosition } from "../domain/position";
import type {
  Delivery,
  DeliveryOutcome,
  DestinationDescriptor,
  RoutingRecord,
} from "../domain/routing";
import type { Suggestion } from "../domain/suggestion";
import type { Delta, Tombstone } from "../domain/sync";
import type {
  AbandonedWork,
  ClaimRequest,
  Job,
  JobResolution,
  JobSubject,
  Lease,
  WorkOutcome,
  WorkWithdrawal,
} from "../domain/work";
import type { LeaseRefusal } from "./refusal";

/** Everything a pool reaches the outside world through. Core sources none of it. */
export type PoolPorts = {
  readonly store: PoolStore;
  readonly work: WorkQueue;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly schemas: SchemaValidator;
  readonly blobs: BlobStore;
  /** Absent disables the mirror: nothing enqueues mirror jobs. */
  readonly mirrorWriter?: MirrorWriter;
  readonly destinations: readonly DestinationAdapter[];
};

export interface Clock {
  now(): Timestamp;
}

/** Only the brands that are minted: `next<BlobHash>()` fabricates a fact, and will not compile. */
export interface IdGenerator {
  next<T extends MintableId>(): T;
}

export interface SchemaValidator {
  validate(schema: JsonSchema, value: JsonValue): readonly SchemaIssue[];
}

/**
 * Bytes, by the hash of their content. It holds no names and no counts: which
 * assets exist, and which items reference them, are both the pool store's, so
 * that releasing an asset moves both counts in one transaction.
 */
export interface BlobStore {
  /** Hashes what it is given, and answers what it turned out to be. Storing the same bytes twice is one blob. */
  put(bytes: AsyncIterable<Uint8Array>): Promise<StoredBlob>;
  /** Absent means the bytes are gone from under a row that still names them. */
  open(
    blob: BlobHash,
    signal?: AbortSignal,
  ): Promise<AsyncIterable<Uint8Array> | undefined>;
  verify(blob: BlobHash): Promise<BlobIntegrity>;
  /** Absent already is the outcome asked for: a sweep that half-ran must be able to finish. */
  delete(blob: BlobHash): Promise<void>;
  /**
   * Where the bytes are, in whatever terms this driver stores them. The layout
   * is the driver's, and a mirror rendering that wants to point at a blob has
   * to ask rather than compose one of its own.
   */
  pathFor(blob: BlobHash): string;
}

/**
 * Where a record's bytes land, and what a person sees beside them. Core hands
 * over a finished record; layout, atomicity and rendering are the driver's.
 */
export interface MirrorWriter {
  write(record: MirrorRecord): Promise<void>;
  /** The item may already be purged, so this is given a bare id. */
  remove(item: ItemId): Promise<void>;
}

/**
 * What one entry in the mirror turned out to be. A record carries the item, its
 * artifacts and its routing together, so there is nothing to ask for per item.
 *
 * Everything the reader could not turn into a record is still reported: verify
 * has to see the file that would not parse and the debris a crash left, and a
 * reader that passed over them quietly would let it call a mirror healthy that
 * cannot rebuild. Whether a record is an *orphan* is not the reader's to say —
 * that needs the pool.
 */
export type MirrorEntry =
  | {
      readonly kind: "record";
      readonly path: string;
      readonly record: MirrorRecord;
      /**
       * The rendering beside it. Absent is a finding rather than a fault: a
       * renderer that was abandoned leaves a complete record and no `.md`, and
       * verify is what reports the pair as incomplete.
       */
      readonly rendering?: string;
    }
  | {
      readonly kind: "unreadable";
      readonly path: string;
      readonly detail: string;
    }
  | { readonly kind: "stray"; readonly path: string };

/**
 * Reads mirror text, which normal operation never does. Handed to rebuild and
 * verify explicitly, and never wired into a pool.
 */
export interface MirrorReader {
  entries(): AsyncIterable<MirrorEntry>;
}

/**
 * Identity is static and capabilities are not: a destination may have to ask
 * something outside this process what it can currently accept, so `describe`
 * is answered per read while `id` stays what a record was written against.
 */
export interface DestinationAdapter {
  readonly id: DestinationId;
  describe(signal?: AbortSignal): Promise<DestinationDescriptor>;
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

  feed(page: OrderedPage): Promise<Slice<Item>>;
  queue(page: OrderedPage): Promise<Slice<Item>>;
  archived(page: OrderedPage): Promise<Slice<Item>>;

  suggestions(item: ItemId): Promise<readonly Suggestion[]>;
  suggestion(id: SuggestionId): Promise<Suggestion | undefined>;
  routingRecords(item: ItemId): Promise<readonly RoutingRecord[]>;
  routingRecord(id: RoutingRecordId): Promise<RoutingRecord | undefined>;
  artifacts(item: ItemId): Promise<readonly Artifact[]>;
  enrichmentStates(item: ItemId): Promise<readonly EnrichmentStatus[]>;

  /** Resolves a reference. Inside a transaction this is what makes a capture's assets a precondition. */
  asset(id: AssetId): Promise<Asset | undefined>;

  /** The pool store owns the item-to-asset count, so only it can find these. */
  unreferencedAssets(
    olderThan: Timestamp,
    limit: number,
  ): Promise<readonly AssetId[]>;

  actions(query: ActionQuery, page: OrderedPage): Promise<Slice<Action>>;
  changesSince(cursor: SyncCursor | undefined, limit: number): Promise<Delta>;
}

/**
 * Reads and writes inside one transaction.
 *
 * Which assets an item references is not passed to `insertItem`: the store
 * takes it from the payload, so the count and the payload cannot disagree.
 */
export interface PoolTx extends PoolReads {
  insertItem(record: ItemRecord): Promise<Item>;
  appendAction(action: Action): Promise<void>;
  enqueue(jobs: readonly Job[]): Promise<void>;

  setArchiveState(item: ItemId, state?: ArchiveState): Promise<Item>;

  insertRoutingRecord(record: RoutingRecord): Promise<void>;

  /** Throws on a record that is not there: resolving one that has gone is a lost write. */
  resolveRoutingRecord(
    record: RoutingRecordId,
    pointer?: string,
  ): Promise<void>;

  /**
   * Only ever a record that never delivered: a reservation is not in the
   * append-only log yet. Removing one that has already gone is not an error —
   * a delivery abandoned after being cancelled asks for exactly that.
   */
  removeRoutingRecord(record: RoutingRecordId): Promise<void>;

  withdrawWork(subject: JobSubject): Promise<WorkWithdrawal>;

  /** When it was stored is the store's, the way `modifiedAt` is: operational, and not part of the asset. */
  insertAsset(asset: Asset): Promise<void>;

  /**
   * Releases assets, and answers the blobs that lost their last one — which are
   * then the caller's to delete, outside this transaction. Releasing an asset an
   * item still references fails rather than succeeding quietly.
   */
  deleteAssets(assets: readonly AssetId[]): Promise<readonly BlobHash[]>;

  /** The job a lease still holds, or nothing if the lease has been taken over. */
  leasedJob(lease: LeaseId): Promise<Lease | undefined>;
  resolveJob(lease: LeaseId, resolution: JobResolution): Promise<void>;
}

export interface PoolStore extends PoolReads {
  /**
   * Applies `work` all-or-nothing: the store commits what it wrote when the
   * promise resolves and discards it when the promise rejects.
   *
   * **Core performs no outside I/O in here.** The store holds a write lock for
   * as long as `work` runs, so awaiting an asset store, a provider or a
   * destination inside a transaction stalls the pool. Validate, fetch and hash
   * first, then open the transaction. The types do not enforce this.
   */
  transaction<T>(work: (tx: PoolTx) => Promise<T>): Promise<T>;

  /**
   * Releases whatever the store holds open. Declared on every store even where
   * one has nothing to release, so a host disposing a pool never has to ask
   * which kind of store it wired.
   */
  close(): Promise<void>;
}

/**
 * Dispatch: who holds which job, for how long, and what was given up on. None
 * of it touches item state, which is what separates it from the enqueue and
 * resolve on `PoolTx` — those mean nothing outside the transaction that caused
 * the work, and so can never live anywhere but the store.
 *
 * A driver may implement this and `PoolStore` as one object, and every driver
 * so far does. The split says which half would have to move to run the queue
 * elsewhere, not that it already has.
 */
export interface WorkQueue {
  claim(request: ClaimRequest, now: Timestamp): Promise<readonly Lease[]>;
  extendLease(
    lease: LeaseId,
    until: Timestamp,
  ): Promise<Result<Lease, LeaseRefusal>>;
  releaseLease(lease: LeaseId): Promise<Result<void, LeaseRefusal>>;
  abandonedWork(
    page: Page<AbandonedPosition>,
  ): Promise<Slice<AbandonedWork, AbandonedPosition>>;
}
