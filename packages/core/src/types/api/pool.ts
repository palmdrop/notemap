import type { JsonObject } from "../json";
import type { Page, PageRequest, Result, Slice } from "../result";
import type { Action } from "../domain/action-log";
import type { Agent } from "../domain/agent";
import type {
  Asset,
  AssetMeta,
  AssetOutcome,
  BlobIntegrity,
} from "../domain/asset";
import type {
  CaptureEnvelope,
  CaptureOutcome,
  EditEnvelope,
} from "../domain/capture";
import type {
  CandidatesReport,
  CandidatesRequest,
  Destination,
  DestinationChanges,
  DestinationDraft,
  DestinationKind,
  DestinationReport,
} from "../domain/destination";
import type { Artifact, EnrichmentStatus } from "../domain/enrichment";
import type {
  ArtifactId,
  AssetId,
  DestinationId,
  Duration,
  EnrichmentName,
  ItemId,
  LeaseId,
  PoolIdentity,
  RoutingRecordId,
  SuggestionId,
  SyncCursor,
  TagName,
} from "../domain/ids";
import type { EditOutcome, Item, TagUse } from "../domain/item";
import type { MirrorRecord, MirrorSubject } from "../domain/mirror";
import type { AbandonedPosition } from "../domain/position";
import type {
  AttemptableDelivery,
  DeliveryRequest,
  RoutingRecord,
} from "../domain/routing";
import type { Suggestion } from "../domain/suggestion";
import type { Delta, Tombstone } from "../domain/sync";
import type {
  AbandonedWork,
  ClaimRequest,
  Lease,
  WorkOutcome,
} from "../domain/work";
import type { MirrorReader } from "./ports";
import type {
  ActionLogRefusal,
  ArchiveRefusal,
  ArtifactRefusal,
  AssetRefusal,
  AssetStoreRefusal,
  CaptureRefusal,
  CancelRefusal,
  CompletionRefusal,
  DeliveryRefusal,
  DestinationDeletionRefusal,
  DestinationRefusal,
  EditRefusal,
  EnrichmentRefusal,
  LeaseRefusal,
  PurgeRefusal,
  RetireRefusal,
  RoutingRefusal,
  SuggestionRefusal,
  TagRefusal,
} from "./refusal";

export interface ItemsApi {
  get(id: ItemId): Promise<Item | undefined>;
  edit(
    id: ItemId,
    envelope: EditEnvelope,
    by: Agent,
  ): Promise<Result<EditOutcome, EditRefusal>>;
  tag(id: ItemId, tag: TagName, by: Agent): Promise<Result<Item, TagRefusal>>;
  untag(id: ItemId, tag: TagName, by: Agent): Promise<Result<Item, TagRefusal>>;
  archive(id: ItemId, reason?: string): Promise<Result<Item, ArchiveRefusal>>;
  unarchive(id: ItemId): Promise<Result<Item, ArchiveRefusal>>;
  purge(id: ItemId): Promise<Result<readonly Tombstone[], PurgeRefusal>>;
}

export interface ViewsApi {
  feed(page: PageRequest): Promise<Slice<Item>>;
  /** Oldest first unless asked otherwise, which is the only way it differs from the feed. */
  queue(page: PageRequest): Promise<Slice<Item>>;
  archived(page: PageRequest): Promise<Slice<Item>>;
}

export interface TagsApi {
  /** Whole and unnarrowed: a caller completing a tag holds the set and filters it. */
  inUse(): Promise<readonly TagUse[]>;
}

export interface SuggestionsApi {
  pendingFor(item: ItemId): Promise<readonly Suggestion[]>;
  accept(id: SuggestionId): Promise<Result<Item, SuggestionRefusal>>;
  reject(id: SuggestionId): Promise<Result<Suggestion, SuggestionRefusal>>;
}

export interface EnrichmentApi {
  statusOf(item: ItemId): Promise<readonly EnrichmentStatus[]>;
  request(
    item: ItemId,
    enrichment: EnrichmentName,
  ): Promise<Result<EnrichmentStatus, EnrichmentRefusal>>;
  artifactsFor(item: ItemId): Promise<readonly Artifact[]>;
  correct(
    artifact: ArtifactId,
    content: JsonObject,
  ): Promise<Result<Artifact, ArtifactRefusal>>;
}

export interface DestinationsApi {
  /** Instant and probing nothing; retired ones included, since a record may still name one. */
  list(): Promise<readonly Destination[]>;
  /** The one call that reaches the outside world. Absent means no destination has that id. */
  describe(
    id: DestinationId,
    signal?: AbortSignal,
  ): Promise<DestinationReport | undefined>;
  /**
   * What one field of one capability's arguments could hold. Also reaches the
   * outside world, and may be asked one scope at a time. Absent means no
   * destination has that id.
   */
  candidates(
    id: DestinationId,
    request: CandidatesRequest,
    signal?: AbortSignal,
  ): Promise<CandidatesReport | undefined>;
  /** Every kind the host wired an adapter for, with the schema its settings must satisfy. */
  kinds(): readonly DestinationKind[];

  create(
    draft: DestinationDraft,
  ): Promise<Result<Destination, DestinationRefusal>>;
  /**
   * Name, settings or both, in one transaction: two calls would leave an edit
   * half-applied. The kind is not among them, and a half that arrives
   * unchanged appends nothing.
   */
  edit(
    id: DestinationId,
    changes: DestinationChanges,
  ): Promise<Result<Destination, DestinationRefusal>>;

  retire(id: DestinationId): Promise<Result<Destination, RetireRefusal>>;
  unretire(id: DestinationId): Promise<Result<Destination, RetireRefusal>>;

  /** Allowed only where no routing record has ever named it. */
  delete(id: DestinationId): Promise<Result<void, DestinationDeletionRefusal>>;
}

export interface RoutingApi {
  /** The record it answers may be pending: read the state rather than reading a record as arrival. */
  route(
    item: ItemId,
    delivery: DeliveryRequest,
    /** Bounds the one inline attempt. Core imposes no timeout of its own. */
    signal?: AbortSignal,
  ): Promise<Result<RoutingRecord, DeliveryRefusal>>;
  /**
   * Projected on demand rather than handed over as a snapshot, so what leaves
   * is the item as it now stands and the destination as it now is. Absent where
   * there is nothing left to carry out.
   */
  deliveryFor(
    record: RoutingRecordId,
  ): Promise<AttemptableDelivery | undefined>;
  /** Returns the item to the queue. */
  cancelDelivery(record: RoutingRecordId): Promise<Result<void, CancelRefusal>>;
  markProcessed(
    item: ItemId,
    note?: string,
  ): Promise<Result<RoutingRecord, RoutingRefusal>>;
  recordsFor(item: ItemId): Promise<readonly RoutingRecord[]>;
}

export interface AssetsApi {
  /**
   * The id is the uploader's, so a capture naming an asset can be written
   * before its bytes are sent. Everything else an upload is declined for — a
   * size cap, a digest that disagrees — is interface policy and stays the
   * host's.
   */
  store(
    id: AssetId,
    bytes: AsyncIterable<Uint8Array>,
    meta: AssetMeta,
  ): Promise<Result<AssetOutcome, AssetStoreRefusal>>;
  get(id: AssetId): Promise<Asset | undefined>;
  open(
    id: AssetId,
    signal?: AbortSignal,
  ): Promise<Result<AsyncIterable<Uint8Array>, AssetRefusal>>;
  verify(id: AssetId): Promise<BlobIntegrity>;
}

export interface WorkApi {
  claim(request: ClaimRequest): Promise<readonly Lease[]>;
  complete(
    lease: LeaseId,
    outcome: WorkOutcome,
  ): Promise<Result<void, CompletionRefusal>>;
  extend(lease: LeaseId, by: Duration): Promise<Result<Lease, LeaseRefusal>>;
  release(lease: LeaseId): Promise<Result<void, LeaseRefusal>>;

  /** Everything core has stopped retrying, of every kind, in one list. */
  abandoned(
    page: Page<AbandonedPosition>,
  ): Promise<Slice<AbandonedWork, AbandonedPosition>>;
}

export interface ActionsApi {
  forItem(item: ItemId, page: PageRequest): Promise<Slice<Action>>;
  all(page: PageRequest): Promise<Slice<Action>>;
  clear(item?: ItemId): Promise<Result<void, ActionLogRefusal>>;
}

export interface SyncApi {
  changesSince(cursor: SyncCursor | undefined, limit: number): Promise<Delta>;
}

export interface MirrorApi {
  /** What the mirror would write for this now, or nothing if it has gone. */
  recordFor(subject: MirrorSubject): Promise<MirrorRecord | undefined>;
}

export type MirrorReport = {
  readonly checked: number;
  readonly missing: readonly ItemId[];
  readonly drifted: readonly AssetId[];
};

/**
 * Fast checks that every item has a pair that parses and records the right
 * `modified_at`; deep additionally re-serialises and compares byte for byte,
 * and hashes every referenced blob.
 */
export type VerifyDepth = "fast" | "deep";

/**
 * Rebuild is absent: it makes a pool rather than operating on one. Verify and
 * repair take a reader as an argument, so a pool never holds one.
 */
export interface MaintenanceApi {
  verifyMirror(reader: MirrorReader, depth: VerifyDepth): Promise<MirrorReport>;
  repairMirror(reader: MirrorReader): Promise<MirrorReport>;
  sweepUnreferencedAssets(): Promise<readonly AssetId[]>;
}

export interface Pool {
  identity(): Promise<PoolIdentity>;

  capture(
    envelope: CaptureEnvelope,
  ): Promise<Result<CaptureOutcome, CaptureRefusal>>;

  readonly items: ItemsApi;
  readonly views: ViewsApi;
  readonly tags: TagsApi;
  readonly suggestions: SuggestionsApi;
  readonly enrichment: EnrichmentApi;
  readonly destinations: DestinationsApi;
  readonly routing: RoutingApi;
  readonly assets: AssetsApi;
  readonly work: WorkApi;
  readonly mirror: MirrorApi;
  readonly actions: ActionsApi;
  readonly sync: SyncApi;
  readonly maintenance: MaintenanceApi;

  /** Disposes the pool, releasing every port that holds something open. */
  close(): Promise<void>;
}
