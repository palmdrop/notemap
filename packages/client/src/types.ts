import type {
  Asset,
  Destination,
  Item,
  ItemId,
  RouteRequest,
  RoutingRecord,
} from "./api/types";
import type { Observable } from "rxjs";

import type { OperationId, PendingOperation } from "./outbox/operations";
import type { ClientStore } from "./ports/store";
import type { Transport } from "./ports/transport";

/** A paginated read surface. Where a reader has scrolled is the shell's, never this. */
export type ListState = {
  readonly items: readonly Item[];
  readonly loading: boolean;
  readonly more: boolean;
  readonly failure?: string;
};

export type CaptureInput = {
  /** The capture channel, stamped as the item's source. */
  readonly channel: string;
  readonly text: string;
  readonly asset?: AssetId;
};

type AssetId = Asset["id"];

/**
 * Routing reaches the pool directly and is never an outbox operation: a
 * decision to deliver cannot be replayed from a client that was offline when it
 * was made. A shell disables these rather than queuing them.
 */
export interface RoutingApi {
  destinations(): Promise<readonly Destination[]>;
  route(item: ItemId, request: RouteRequest): Promise<RoutingRecord>;
  markProcessed(item: ItemId, note?: string): Promise<RoutingRecord>;
  recordsFor(item: ItemId): Promise<readonly RoutingRecord[]>;
  /**
   * Withdraws a decision whose delivery has not happened yet. Takes the item as
   * well as the record, because whether it is work again depends on the records
   * it still holds and the pool answers nothing on a cancel.
   */
  cancel(record: RoutingRecord["id"], item: ItemId): Promise<void>;
}

export interface Client {
  readonly feed: Observable<ListState>;
  readonly queue: Observable<ListState>;
  readonly outbox: Observable<readonly PendingOperation[]>;

  loadFeed(): Promise<void>;
  loadQueue(): Promise<void>;
  item(id: ItemId): Promise<Item | undefined>;

  /** Answers as soon as the operation is applied, not when the pool agrees. */
  capture(input: CaptureInput): Promise<Item>;
  archive(item: ItemId, reason?: string): Promise<void>;
  unarchive(item: ItemId): Promise<void>;

  /**
   * Bytes cannot be applied optimistically — the pool mints the id the capture
   * then references — so an upload is a round trip and not an outbox operation.
   */
  uploadAsset(file: File): Promise<Asset>;
  assetContent(asset: AssetId): string;
  images(item: Item): readonly string[];
  /** What an item reads as. Which slot holds that is the payload type's business. */
  says(item: Item): string;

  readonly routing: RoutingApi;

  /** Called on every mutation, and again to retry what is still pending. */
  drain(): Promise<void>;
  dismiss(operation: OperationId): Promise<void>;
}

export type ClientConfig = {
  readonly transport: Transport;
  readonly store: ClientStore;
  /** The clock that stamps an operation-time. A port, so a test can hold it still. */
  readonly now?: () => string;
};
