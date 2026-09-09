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
  PoolIdentity,
  ProviderName,
  RoutingRecordId,
  RoutingTemplateId,
  SourceId,
  SuggestionId,
  SyncCursor,
  TagName,
  Timestamp,
} from "../domain/ids";
import type {
  CandidatesAnswer,
  CandidatesRequest,
  Destination,
  DestinationDescriptor,
  DestinationKind,
  DestinationRecord,
  NamingAnswer,
  NamingRequest,
} from "../domain/destination";
import type {
  ArchiveState,
  Item,
  ItemRecord,
  Tag,
  TagUse,
} from "../domain/item";
import type { MirrorRecord, MirrorSubject } from "../domain/mirror";
import type {
  RoutingTemplate,
  RoutingTemplateRecord,
} from "../domain/template";
import type { Payload } from "../domain/payload";
import type { AbandonedPosition } from "../domain/position";
import type {
  DeliveredOutput,
  Delivery,
  DeliveryLanding,
  DeliveryOutcome,
  RememberedAnswer,
  RememberedRequest,
  RoutingRecord,
} from "../domain/routing";
import type { SourceUse } from "../domain/source";
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
  readonly destinations: Destinations;
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
  /** What it names may already be gone, so this is given a bare subject. */
  remove(subject: MirrorSubject): Promise<void>;
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
 * Neither `describe` nor `deliver` is ever handed a destination whose kind is
 * absent from `kinds()`: core reports that as unusable rather than asking.
 */
export interface Destinations {
  kinds(): readonly DestinationKind[];
  describe(
    destination: Destination,
    signal?: AbortSignal,
  ): Promise<DestinationDescriptor>;
  deliver(
    destination: Destination,
    delivery: Delivery,
    signal?: AbortSignal,
  ): Promise<DeliveryOutcome>;
  /** Rejects with `NotOffered` where the adapter registered for the kind has none. */
  candidates(
    destination: Destination,
    request: CandidatesRequest,
    signal?: AbortSignal,
  ): Promise<CandidatesAnswer>;
  /** Rejects with `NotOffered` where the adapter registered for the kind has none. */
  naming(
    destination: Destination,
    request: NamingRequest,
    signal?: AbortSignal,
  ): Promise<NamingAnswer>;
  /** Rejects with `NotOffered` where the adapter registered for the kind has none. */
  preview(
    destination: Destination,
    delivery: Delivery,
    signal?: AbortSignal,
  ): Promise<DeliveredOutput>;
  /**
   * Resolves where the destination is really there. Rejects with `Rejected`
   * where it answered no, with `NotOffered` where the adapter has none, and
   * with anything else where it could not be reached.
   */
  probe(destination: Destination, signal?: AbortSignal): Promise<void>;
}

export interface DestinationKindAdapter extends DestinationKind {
  describe(
    destination: Destination,
    signal?: AbortSignal,
  ): Promise<DestinationDescriptor>;
  deliver(
    destination: Destination,
    delivery: Delivery,
    signal?: AbortSignal,
  ): Promise<DeliveryOutcome>;
  /** Absent is the same answer to a caller as a kind that tried and could not say: not-offered. */
  candidates?(
    destination: Destination,
    request: CandidatesRequest,
    signal?: AbortSignal,
  ): Promise<CandidatesAnswer>;
  /**
   * What one value this field holds is called. Absent is not-offered, and is
   * the right answer for a kind whose values are their own names: a path says
   * what it is, and a second name for one would be something to hide it behind.
   */
  naming?(
    destination: Destination,
    request: NamingRequest,
    signal?: AbortSignal,
  ): Promise<NamingAnswer>;
  /**
   * What `deliver` would produce, writing nothing. That the two agree is this
   * adapter's discipline rather than something the port can enforce.
   *
   * Throwing `Rejected` is a delivery that would be refused; throwing anything
   * else could not be reached. Absent is `not-offered`.
   */
  preview?(
    destination: Destination,
    delivery: Delivery,
    signal?: AbortSignal,
  ): Promise<DeliveredOutput>;
  /**
   * Resolving is `ready`; throwing `Rejected` is a no a person must act on, and
   * throwing anything else could not be reached. Absent is `not-offered`.
   */
  probe?(destination: Destination, signal?: AbortSignal): Promise<void>;
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
  /** At most one row: every item claims an identity, and no two claim the same one. */
  itemBySourceIdentity(
    source: SourceId,
    sourceItemId: string,
  ): Promise<Item | undefined>;
  tombstone(id: ItemId): Promise<Tombstone | undefined>;

  feed(page: OrderedPage): Promise<Slice<Item>>;
  queue(page: OrderedPage): Promise<Slice<Item>>;
  archived(page: OrderedPage): Promise<Slice<Item>>;

  /** Ordered most used first, then by name, so a completion list needs no sort. */
  tagsInUse(): Promise<readonly TagUse[]>;

  /** Every source the pool has an item from, most recently captured first. */
  sourcesInUse(): Promise<readonly SourceUse[]>;

  suggestions(item: ItemId): Promise<readonly Suggestion[]>;
  suggestion(id: SuggestionId): Promise<Suggestion | undefined>;
  routingRecords(item: ItemId): Promise<readonly RoutingRecord[]>;
  routingRecord(id: RoutingRecordId): Promise<RoutingRecord | undefined>;
  /**
   * What one field of one capability has held on this destination, with how
   * often and when last. A `delivered` record counts outright; a `pending` one
   * counts unless its delivery was abandoned, which is why this reaches the job
   * and is not a query over records alone.
   */
  remembered(request: RememberedRequest): Promise<RememberedAnswer>;

  /** Every destination the pool holds, retired ones included, oldest first. */
  destinations(): Promise<readonly Destination[]>;
  destination(id: DestinationId): Promise<Destination | undefined>;
  /** A reservation still to land counts as much as a delivered record: both name it. */
  destinationEverNamed(id: DestinationId): Promise<boolean>;

  /** Every routing template the pool holds, oldest first. */
  routingTemplates(): Promise<readonly RoutingTemplate[]>;
  routingTemplate(id: RoutingTemplateId): Promise<RoutingTemplate | undefined>;
  /** At most one: a trigger tag is claimed by one template or by none. */
  routingTemplateByTriggerTag(
    tag: TagName,
  ): Promise<RoutingTemplate | undefined>;
  /**
   * The templates a destination's deletion would strand. Deleting is allowed —
   * a template is configuration rather than history — so this is what says
   * which ones the person is about to break.
   */
  routingTemplatesNaming(
    destination: DestinationId,
  ): Promise<readonly RoutingTemplate[]>;
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

  /** Whether the item already carries the tag is core's to read and decide on. */
  addTag(item: ItemId, tag: Tag): Promise<Item>;
  removeTag(item: ItemId, tag: TagName): Promise<Item>;

  /** `at` is the content time the row takes, which is what moves it in the queue. */
  amendItem(item: ItemId, payload: Payload, at: Timestamp): Promise<Item>;

  insertRoutingRecord(record: RoutingRecord): Promise<void>;

  /** Throws on a record that is not there: resolving one that has gone is a lost write. */
  resolveRoutingRecord(
    record: RoutingRecordId,
    landing: DeliveryLanding,
  ): Promise<void>;

  /**
   * Only ever a record that never delivered: a reservation is not in the
   * append-only log yet. Removing one that has already gone is not an error —
   * a delivery abandoned after being cancelled asks for exactly that.
   */
  removeRoutingRecord(record: RoutingRecordId): Promise<void>;

  insertRoutingTemplate(
    record: RoutingTemplateRecord,
  ): Promise<RoutingTemplate>;
  /** Every field a person may change is written at once; the store owns `modifiedAt`. */
  updateRoutingTemplate(
    record: RoutingTemplateRecord,
  ): Promise<RoutingTemplate>;
  /**
   * A record naming it keeps resolving: the record carries what it routed as,
   * and the template it came from is a name that may go.
   */
  deleteRoutingTemplate(id: RoutingTemplateId): Promise<void>;

  insertDestination(record: DestinationRecord): Promise<Destination>;
  /** Every field a person may change is written at once; the store owns `modifiedAt`. */
  updateDestination(record: DestinationRecord): Promise<Destination>;
  /** Refused by the store itself where a routing record names it. */
  deleteDestination(id: DestinationId): Promise<void>;

  withdrawWork(subject: JobSubject): Promise<WorkWithdrawal>;

  /** When it was stored is the store's, the way `modifiedAt` is: operational, and not part of the asset. */
  insertAsset(asset: Asset): Promise<void>;

  /**
   * Releases assets, and answers the blobs that lost their last one — which are
   * then the caller's to delete, outside this transaction. Releasing an asset an
   * item still references fails rather than succeeding quietly.
   *
   * A blob a routing record names as its output is never answered, however few
   * assets are left naming it: an output is named by a record rather than by an
   * asset, and the two may be the same bytes.
   */
  deleteAssets(assets: readonly AssetId[]): Promise<readonly BlobHash[]>;

  /** The job a lease still holds, or nothing if the lease has been taken over. */
  leasedJob(lease: LeaseId): Promise<Lease | undefined>;
  resolveJob(lease: LeaseId, resolution: JobResolution): Promise<void>;
}

export interface PoolStore extends PoolReads {
  /**
   * Which pool this is. Minted by the driver with the pool itself and never
   * reset: a store that answered a different one over the life of one pool
   * would tell a client its whole cache belongs to somewhere else.
   */
  identity(): Promise<PoolIdentity>;

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
