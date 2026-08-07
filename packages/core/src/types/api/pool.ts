import type { JsonObject } from "../json";
import type { FeedPage, Page, Result, Slice } from "../result";
import type { Action } from "../domain/action-log";
import type { Agent } from "../domain/agent";
import type { Asset, AssetMeta, BlobIntegrity } from "../domain/asset";
import type { CaptureEnvelope, CaptureOutcome } from "../domain/capture";
import type { Artifact, EnrichmentStatus } from "../domain/enrichment";
import type {
  ArtifactId,
  AssetId,
  Duration,
  EnrichmentName,
  ItemId,
  LeaseId,
  SuggestionId,
  SyncCursor,
  TagName,
} from "../domain/ids";
import type { EditOutcome, Item } from "../domain/item";
import type { Payload } from "../domain/payload";
import type {
  DeliveryRequest,
  DestinationDescriptor,
  RoutingRecord,
} from "../domain/routing";
import type { Suggestion } from "../domain/suggestion";
import type { Delta, Tombstone } from "../domain/sync";
import type { ClaimRequest, Lease, WorkOutcome } from "../domain/work";
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
  RebuildRefusal,
  RoutingRefusal,
  SuggestionRefusal,
  TagRefusal,
} from "./refusal";

export interface ItemsApi {
  get(id: ItemId): Promise<Item | undefined>;
  edit(id: ItemId, payload: Payload): Promise<Result<EditOutcome, EditRefusal>>;
  tag(id: ItemId, tag: TagName, by: Agent): Promise<Result<Item, TagRefusal>>;
  untag(id: ItemId, tag: TagName): Promise<Result<Item, TagRefusal>>;
  archive(id: ItemId, reason?: string): Promise<Result<Item, ArchiveRefusal>>;
  unarchive(id: ItemId): Promise<Result<Item, ArchiveRefusal>>;
  purge(id: ItemId): Promise<Result<readonly Tombstone[], PurgeRefusal>>;
}

export interface ViewsApi {
  feed(page: FeedPage): Promise<Slice<Item>>;
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
  ): Promise<Result<void, LeaseRefusal>>;
  extend(lease: LeaseId, by: Duration): Promise<Result<Lease, LeaseRefusal>>;
  release(lease: LeaseId): Promise<Result<void, LeaseRefusal>>;
}

export interface ActionsApi {
  forItem(item: ItemId, page: Page): Promise<Slice<Action>>;
  all(page: Page): Promise<Slice<Action>>;
  clear(item?: ItemId): Promise<Result<void, ActionLogRefusal>>;
}

export interface SyncApi {
  changesSince(cursor: SyncCursor | undefined, limit: number): Promise<Delta>;
}

export type MirrorReport = {
  readonly checked: number;
  readonly missing: readonly ItemId[];
  readonly drifted: readonly AssetId[];
};

export interface MaintenanceApi {
  rebuildFromMirror(): Promise<Result<number, RebuildRefusal>>;
  verifyMirror(): Promise<MirrorReport>;
  repairMirror(): Promise<MirrorReport>;
  sweepUnreferencedAssets(): Promise<readonly AssetId[]>;
}

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
  readonly maintenance: MaintenanceApi;

  /**
   * Disposes the pool, releasing every port that holds something open. The host
   * decides when a pool is done with; core never decides for it. Wiring the
   * ports is the host's job, operating them afterwards is not.
   */
  close(): Promise<void>;
}
