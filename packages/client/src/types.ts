import type {
  Asset,
  CreateDestinationRequest,
  Destination,
  DestinationDescription,
  DestinationId,
  DestinationKind,
  Item,
  ItemId,
  Payload,
  RouteRequest,
  RoutingRecord,
  TagUse,
  UpdateDestinationRequest,
} from "./api/types";
import type { Observable } from "rxjs";

import type { OperationId, PendingOperation } from "./outbox/operations";
import type { ClientStore } from "./ports/store";
import type { Transport } from "./ports/transport";

/**
 * Which end of a surface a reader starts from. Oldest first is why the queue is
 * a queue, but the choice is the reader's, and it is the reader's on the feed too.
 */
export type Order = "oldest-first" | "newest-first";

/**
 * Why a read of a surface failed. `refused` is the pool having answered and
 * said no, which coming back into reach does not undo; the other kind is the
 * pool not answering, and it is over the moment one does.
 */
export type ReadFailure = {
  readonly said: string;
  readonly refused: boolean;
};

/** A paginated read surface. Where a reader has scrolled is the shell's, never this. */
export type ListState = {
  readonly items: readonly Item[];
  readonly order: Order;
  readonly loading: boolean;
  readonly more: boolean;
  /** What the client holds rather than what the pool holds, the pool not having answered for this surface. */
  readonly fromCache: boolean;
  readonly failure?: ReadFailure;
};

export type CaptureInput = {
  /** The capture channel, stamped as the item's source. */
  readonly channel: string;
  readonly text: string;
  readonly asset?: AssetId;
};

type AssetId = Asset["id"];

/**
 * The outbox's second exception, on routing's terms: whether a root exists, and
 * whether settings satisfy the kind registry the daemon is actually running,
 * are questions only the daemon can answer. A shell disables these rather than
 * queuing them, and reads the cached list meanwhile.
 */
export interface DestinationsApi {
  /** What was last read, for a screen to render while the pool is unreachable. */
  readonly all: Observable<readonly Destination[]>;

  /** Fills the cache `all` answers from, and answers the same list. */
  load(): Promise<readonly Destination[]>;
  /** Every kind the daemon has an adapter for, with the schema a form is built from. */
  kinds(): Promise<readonly DestinationKind[]>;
  /** What one can do, asked now. The only call here that reaches past the pool. */
  describe(id: DestinationId): Promise<DestinationDescription>;

  create(request: CreateDestinationRequest): Promise<Destination>;
  update(
    id: DestinationId,
    changes: UpdateDestinationRequest,
  ): Promise<Destination>;
  retire(id: DestinationId): Promise<Destination>;
  unretire(id: DestinationId): Promise<Destination>;
  /** Refused by the pool where a routing record has ever named it. */
  delete(id: DestinationId): Promise<void>;
}

/**
 * What a person is offered while they type, never a gate on what may be
 * written: classification is an outbox operation and tagging works offline.
 */
export interface TagsApi {
  /** Most used first, as the pool last counted it. Empty until `load` has run. */
  readonly inUse: Observable<readonly TagUse[]>;
  /** Fills the set `inUse` answers from, and answers the same list. */
  load(): Promise<readonly TagUse[]>;
}

/**
 * Routing reaches the pool directly and is never an outbox operation: a
 * decision to deliver cannot be replayed from a client that was offline when it
 * was made. A shell disables these rather than queuing them.
 */
export interface RoutingApi {
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
  /** Whether the pool is answering. Optimistic before anything has asked. */
  readonly reachable: Observable<boolean>;

  readonly feed: Observable<ListState>;
  readonly queue: Observable<ListState>;
  readonly outbox: Observable<readonly PendingOperation[]>;

  /**
   * Reads the next page. Naming an order the surface is not already in turns it
   * around and starts again, because a position belongs to the order that made it.
   */
  loadFeed(order?: Order): Promise<void>;
  loadQueue(order?: Order): Promise<void>;
  item(id: ItemId): Promise<Item | undefined>;

  /** Answers as soon as the operation is applied, not when the pool agrees. */
  capture(input: CaptureInput): Promise<Item>;
  archive(item: ItemId, reason?: string): Promise<void>;
  unarchive(item: ItemId): Promise<void>;
  tag(item: ItemId, tag: string): Promise<void>;
  untag(item: ItemId, tag: string): Promise<void>;

  /**
   * Changes what an item says. Whether that lands as an amendment or a revision
   * is the pool's call, and the client reconciles to whichever it recorded — so
   * this answers when the operation is applied, not when the shape is known.
   */
  edit(item: ItemId, payload: Payload, source: string): Promise<void>;
  /** The payload an edit would carry for new words, whichever slot holds them. */
  saying(item: Item, said: string): Payload;

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
  readonly destinations: DestinationsApi;
  readonly tags: TagsApi;

  /** Called on every mutation, and again to retry what is still pending. */
  drain(): Promise<void>;
  dismiss(operation: OperationId): Promise<void>;

  /**
   * Stops the reachability probe, which is the one thing here that keeps
   * running rather than waiting to be called. A web shell holds one client for
   * the life of the page and never needs this; a shell that builds a second
   * client, and a test, do.
   */
  close(): void;
}

export type ClientConfig = {
  readonly transport: Transport;
  readonly store: ClientStore;
  /** The clock that stamps an operation-time. A port, so a test can hold it still. */
  readonly now?: () => string;
  /**
   * Where a failure with no caller waiting on it goes. A shell decides whether
   * that is a console, a log or something a person sees; unwired, these are
   * swallowed as they were before.
   */
  readonly onError?: (error: unknown) => void;
};
