import type { Action } from "./action-log.js";
import type { Agent } from "./agent.js";
import type { Asset, AssetMeta, BlobIntegrity } from "./asset.js";
import type { CaptureEnvelope, CaptureOutcome } from "./capture.js";
import type { Artifact, EnrichmentStatus } from "./enrichment.js";
import type {
  ArtifactId,
  AssetId,
  Duration,
  EnrichmentName,
  ItemId,
  JsonObject,
  LeaseId,
  SuggestionId,
  TagName,
} from "./ids.js";
import type { EditOutcome, Item } from "./item.js";
import type { Page, Slice } from "./paging.js";
import type { Payload } from "./payload.js";
import type {
  ActionLogRefusal,
  ArchiveRefusal,
  ArtifactRefusal,
  AssetRefusal,
  CaptureRefusal,
  DeliveryRefusal,
  EditRefusal,
  EnrichmentRefusal,
  LeaseRefusal,
  PurgeRefusal,
  RoutingRefusal,
  SuggestionRefusal,
  TagRefusal,
} from "./refusal.js";
import type { Result } from "./result.js";
import type {
  DeliveryRequest,
  DestinationDescriptor,
  RoutingRecord,
} from "./routing.js";
import type { Suggestion } from "./suggestion.js";
import type { Delta, SyncCursor, Tombstone } from "./sync.js";
import type { ClaimRequest, Lease, WorkOutcome } from "./work.js";

export interface ItemsApi {
  get(id: ItemId): Promise<Item | undefined>;
  edit(id: ItemId, payload: Payload): Promise<Result<EditOutcome, EditRefusal>>;
  tag(id: ItemId, tag: TagName, by: Agent): Promise<Result<Item, TagRefusal>>;
  untag(id: ItemId, tag: TagName): Promise<Result<Item, TagRefusal>>;
  archive(id: ItemId, reason?: string): Promise<Result<Item, ArchiveRefusal>>;
  unarchive(id: ItemId): Promise<Result<Item, ArchiveRefusal>>;
  purge(id: ItemId): Promise<Result<Tombstone, PurgeRefusal>>;
}

/** Ordered and paginated; where processing has got to is the caller's to remember. */
export interface ViewsApi {
  feed(page: Page): Promise<Slice<Item>>;
  queue(page: Page): Promise<Slice<Item>>;
  archived(page: Page): Promise<Slice<Item>>;
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

  /** Everything that has given up, so a client can show what needs attention. */
  abandoned(page: Page): Promise<Slice<EnrichmentStatus>>;
}

export interface RoutingApi {
  destinations(): Promise<readonly DestinationDescriptor[]>;
  route(
    item: ItemId,
    delivery: DeliveryRequest,
  ): Promise<Result<RoutingRecord, DeliveryRefusal>>;
  markProcessed(
    item: ItemId,
    note?: string,
  ): Promise<Result<RoutingRecord, RoutingRefusal>>;
  recordsFor(item: ItemId): Promise<readonly RoutingRecord[]>;
}

export interface AssetsApi {
  store(
    bytes: AsyncIterable<Uint8Array>,
    meta: AssetMeta,
  ): Promise<Result<Asset, AssetRefusal>>;
  get(id: AssetId): Promise<Asset | undefined>;
  /** Refuses rather than returning nothing, because a missing blob is not the same as a missing asset. */
  open(
    id: AssetId,
    signal?: AbortSignal,
  ): Promise<Result<AsyncIterable<Uint8Array>, AssetRefusal>>;
  verify(id: AssetId): Promise<BlobIntegrity>;
}

/** Core exposes claimable work; the host decides when and how much to run. */
export interface WorkApi {
  claim(request: ClaimRequest): Promise<readonly Lease[]>;
  complete(
    lease: LeaseId,
    outcome: WorkOutcome,
  ): Promise<Result<void, LeaseRefusal>>;
  extend(lease: LeaseId, by: Duration): Promise<Result<Lease, LeaseRefusal>>;
  release(lease: LeaseId): Promise<Result<void, LeaseRefusal>>;
}

export interface ActionsApi {
  forItem(item: ItemId, page: Page): Promise<Slice<Action>>;
  all(page: Page): Promise<Slice<Action>>;
  /** Purging an item leaves its history; discarding that is a separate wish. */
  clear(item?: ItemId): Promise<Result<void, ActionLogRefusal>>;
}

export interface SyncApi {
  changesSince(cursor: SyncCursor | undefined, limit: number): Promise<Delta>;
}

/** One instance per pool. Nothing here is global, ambient or shared. */
export interface Pool {
  capture(
    envelope: CaptureEnvelope,
  ): Promise<Result<CaptureOutcome, CaptureRefusal>>;

  readonly items: ItemsApi;
  readonly views: ViewsApi;
  readonly suggestions: SuggestionsApi;
  readonly enrichment: EnrichmentApi;
  readonly routing: RoutingApi;
  readonly assets: AssetsApi;
  readonly work: WorkApi;
  readonly actions: ActionsApi;
  readonly sync: SyncApi;
}
