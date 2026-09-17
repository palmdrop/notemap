import type {
  Action,
  ActionId,
  ActionKind,
  AssetId,
  CandidatesRequest,
  CreateDestinationRequest,
  Destination,
  DestinationCandidates,
  DestinationDescription,
  DestinationProbe,
  DestinationId,
  DestinationKind,
  DestinationNamed,
  DestinationRemembered,
  Item,
  ItemId,
  MintTokenRequest,
  MintedToken,
  NamingRequest,
  Payload,
  RememberedRequest,
  ResolvedRoutingTemplate,
  RouteRequest,
  RoutingPreview,
  RoutingRecord,
  RoutingTemplate,
  RoutingTemplateId,
  RoutingTemplateReport,
  CreateRoutingTemplateRequest,
  SourceUse,
  TagUse,
  Token,
  UpdateDestinationRequest,
  UpdateRoutingTemplateRequest,
} from "./api/types";
import type { Observable } from "rxjs";

import type { SessionState } from "./session/session";
import type { Surface } from "./state/state";

import type { ActionsSince } from "./actions/watching";
import type { OperationId, PendingOperation } from "./outbox/operations";
import type { Reach } from "./pool/reachability";
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

/**
 * One item, read. The pool's answer where it gave one and the client's own copy
 * where it did not, which is the same fallback a surface makes and said the
 * same way: an absent item with no failure beside it is the pool having
 * answered that there is no such item.
 */
export type ItemState = {
  readonly item?: Item;
  /** Whether the item here is what the client holds rather than what the pool holds. */
  readonly fromCache: boolean;
  readonly failure?: ReadFailure;
};

export type CaptureInput = {
  /** The capture channel, stamped as the item's source. */
  readonly channel: string;
  readonly text: string;
  readonly asset?: AssetId;
};

/**
 * The outbox's second exception, on routing's terms: whether a root exists, and
 * whether settings satisfy the kind registry the daemon is actually running,
 * are questions only the daemon can answer. A shell disables these rather than
 * queuing them, and reads the cached list meanwhile.
 */
export interface TemplatesApi {
  /** What was last read, for a screen to render while the pool is unreachable. */
  readonly all: Observable<readonly RoutingTemplate[]>;
  /** The same cache, read now: a composer naming one is a question with an answer. */
  readonly held: readonly RoutingTemplate[];

  /** Fills the cache `all` answers from, and answers the same list. */
  load(): Promise<readonly RoutingTemplate[]>;
  /**
   * Whether its destination can still support it, asked now and kept by
   * nothing: a folder that was there a minute ago is not a fact about now.
   */
  report(id: RoutingTemplateId): Promise<RoutingTemplateReport>;
  /**
   * What it would route this item as, expanded, reserving nothing. What a
   * composer draws before the commit.
   */
  resolve(
    item: ItemId,
    template: RoutingTemplateId,
  ): Promise<ResolvedRoutingTemplate>;

  create(request: CreateRoutingTemplateRequest): Promise<RoutingTemplate>;
  update(
    id: RoutingTemplateId,
    changes: UpdateRoutingTemplateRequest,
  ): Promise<RoutingTemplate>;
  delete(id: RoutingTemplateId): Promise<void>;
}

export interface DestinationsApi {
  /** What was last read, for a screen to render while the pool is unreachable. */
  readonly all: Observable<readonly Destination[]>;
  /**
   * The same cache, read now. For the callers that are not a rendered screen
   * and have no subscription to hang on: naming a destination in a line of
   * text is a question with an answer, not a thing to redraw.
   */
  readonly held: readonly Destination[];

  /** Fills the cache `all` answers from, and answers the same list. */
  load(): Promise<readonly Destination[]>;
  /** Every kind the daemon has an adapter for, with the schema a form is built from. */
  kinds(): Promise<readonly DestinationKind[]>;
  /** What one can do, asked now. Answered from a declared shape, so it reaches nothing. */
  describe(id: DestinationId): Promise<DestinationDescription>;
  /**
   * Whether it is really there, asked now and kept by nothing: what a probe
   * found is true of a moment, and a cached one would say a vault is fine long
   * after somebody unplugged it.
   */
  probe(id: DestinationId): Promise<DestinationProbe>;
  /**
   * What one field of one capability's arguments could hold, asked now and
   * never cached: a vault's contents are somebody else's state, stale the
   * moment somebody else writes a file. Held only for as long as whoever
   * asked keeps the answer.
   */
  candidates(
    id: DestinationId,
    request: CandidatesRequest,
  ): Promise<DestinationCandidates>;
  /**
   * What one value that field holds is called. The other direction of
   * `candidates`, and asked separately because a browse is a capped sample:
   * the value a surface is already holding is exactly the one a truncated
   * answer may never mention. Asked now and kept by nothing, on the same
   * terms — a title is somebody else's state and changes without notice.
   */
  named(id: DestinationId, request: NamingRequest): Promise<DestinationNamed>;
  /**
   * The same question, answered from the pool rather than the destination:
   * what this field has already held here. Nothing goes and looks, so it
   * answers whether or not the destination can be reached — which is what
   * keeps a place typeable against a vault that is not there.
   */
  remembered(
    id: DestinationId,
    request: RememberedRequest,
  ): Promise<DestinationRemembered>;

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
 * Not cached and not held: a settings screen reads this to notice a source that
 * has stopped capturing, and the answer to *has it stopped* is about now.
 */
export interface SourcesApi {
  /** Most recently captured first, whole and unnarrowed, as tags are. */
  inUse(): Promise<readonly SourceUse[]>;
}

/** Where a read of the log continues from: the sort key of the last row it handed out. */
export type ActionPosition = {
  readonly at: string;
  /** Absent bounds the read on the instant alone, and may skip rows sharing it. */
  readonly id?: ActionId;
};

export type ActionsRequest = {
  readonly order: Order;
  /** Narrows the read to one subject. Never validated: the log outlives the material. */
  readonly item?: ItemId;
  /** Narrows the read to entries of any of these kinds. */
  readonly kinds?: readonly ActionKind[];
  readonly after?: ActionPosition;
};

export type ActionsPage = {
  readonly values: readonly Action[];
  /** Where the next read continues from; absent on the last page. */
  readonly after?: ActionPosition;
};

/**
 * Everything the pool has done. Not a surface with a held page and not in the
 * store: the log is read for diagnosis rather than drained, so what has been
 * walked belongs to whoever is looking and nothing about it survives them.
 */
export interface ActionsApi {
  read(request: ActionsRequest): Promise<ActionsPage>;
  /**
   * What the pool has done since this client started looking, in the order it
   * happened. Asked for on its own tempo while the client is watched and the
   * pool answers; the first read is the mark it counts from and says nothing.
   */
  watch(): Observable<ActionsSince>;
}

/**
 * Routing reaches the pool directly and is never an outbox operation: a
 * decision to deliver cannot be replayed from a client that was offline when it
 * was made. A shell disables these rather than queuing them.
 */
export interface RoutingApi {
  route(item: ItemId, request: RouteRequest): Promise<RoutingRecord>;
  /**
   * Indicative rather than binding: the delivery converts again when it runs.
   * Not an outbox operation and not cached.
   */
  preview(item: ItemId, request: RouteRequest): Promise<RoutingPreview>;
  markProcessed(item: ItemId, note?: string): Promise<RoutingRecord>;
  recordsFor(item: ItemId): Promise<readonly RoutingRecord[]>;
  /**
   * Withdraws a decision whose delivery has not happened yet. Takes the item as
   * well as the record, because whether it is work again depends on the records
   * it still holds and the pool answers nothing on a cancel.
   */
  cancel(record: RoutingRecord["id"], item: ItemId): Promise<void>;
  /** As text; the record says what the bytes are, and one carrying none refuses. */
  output(record: RoutingRecord["id"]): Promise<string>;
}

/**
 * The credentials handed to things that are not browsers. A session is required
 * to reach any of this: without that rule a leaked token would mint its own
 * replacement, and revoking the one you know about would leave the one you do
 * not.
 */
export interface TokensApi {
  /** Names, times and last use. No secret is ever listed. */
  list(): Promise<readonly Token[]>;
  /** The one answer carrying the token string, which is not stored anywhere. */
  mint(request: MintTokenRequest): Promise<MintedToken>;
  /** Takes effect on the next request. Revoking one already gone is not a failure. */
  revoke(id: string): Promise<void>;
}

export interface Client {
  /**
   * Whether the pool is answering, and when it last did. Optimistic before
   * anything has asked, which is the one state carrying no time.
   */
  readonly reachable: Observable<Reach>;

  /**
   * Who this client is to the daemon, and whether the daemon asks at all. A
   * surface draws the login from this rather than inferring it from a refusal.
   */
  readonly session: Observable<SessionState>;

  readonly tokens: TokensApi;

  /** Asks the daemon who this is. Open, so it answers whether or not anyone is. */
  askSession(): Promise<SessionState>;
  login(name: string, password: string): Promise<void>;
  /** Drops what was drawn from the pool and keeps the outbox, which is not the pool's. */
  logout(): Promise<void>;

  readonly feed: Observable<ListState>;
  readonly queue: Observable<ListState>;
  readonly outbox: Observable<readonly PendingOperation[]>;
  /**
   * The items an outbox operation about them has not drained, which is what a
   * shell draws a row's `pending` mark from. Sending and unreachable ones are
   * in it; a refused one never is, since waiting will not settle a refusal.
   */
  readonly undrained: Observable<ReadonlySet<ItemId>>;
  /** How many operations are undrained, for the one count in the chrome. */
  readonly waiting: Observable<number>;

  /**
   * Reads the next page. Naming an order the surface is not already in turns it
   * around and starts again, because a position belongs to the order that made it.
   */
  loadFeed(order?: Order): Promise<void>;
  loadQueue(order?: Order): Promise<void>;
  /**
   * Somebody has arrived at a surface. The queue is read again from the start,
   * its membership having changed under a reader who was elsewhere; the feed
   * keeps what it walked, nothing ever leaving it. A surface nobody has read is
   * read for the first time either way.
   */
  enter(surface: Surface, order?: Order): Promise<void>;
  /**
   * One item, whether or not a surface has ever drawn it, so an address the
   * cache has never held is still somewhere a person can go. A pool that does
   * not answer leaves the client's own copy, which is why this says which it is.
   */
  item(id: ItemId): Promise<ItemState>;
  /**
   * The copy the client holds, as the outbox and the pool change it. A surface
   * drawing one item reads this after `item` has settled what to draw, so an
   * archive made there marks the item the way it marks a row.
   */
  held(id: ItemId): Observable<Item | undefined>;

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
   * Mints an asset for a file and holds its bytes, so a capture can name them
   * with nothing sent; the upload happens in the drain, under the id answered
   * here.
   */
  attach(file: File): Promise<AssetId>;
  /** Where an asset's bytes are: the store's own, while it still holds them. */
  assetContent(asset: AssetId): string;
  images(item: Item): readonly string[];
  /** What an item reads as. Which slot holds that is the payload type's business. */
  says(item: Item): string;

  readonly routing: RoutingApi;
  readonly destinations: DestinationsApi;
  readonly templates: TemplatesApi;
  readonly tags: TagsApi;
  readonly sources: SourcesApi;
  readonly actions: ActionsApi;

  /** Called on every mutation, and again to retry what is still pending. */
  drain(): Promise<void>;

  /**
   * Whether anyone is looking at what this client draws. The probe runs while
   * they are and pauses while they are not, so an unwatched shell costs the
   * pool nothing and asks once when it is looked at again.
   */
  watched(yes: boolean): void;

  /**
   * Asks the pool now, out of turn, and settles `reachable` with what it says.
   * The probe runs on its own; this is for a person who would rather not wait
   * for the next one.
   */
  probe(): Promise<void>;
  dismiss(operation: OperationId): Promise<void>;

  /**
   * Lets go of everything that runs without being asked — the probe, the
   * watcher, a drain waiting on a lease — so a process holding nothing else
   * ends. A web shell holds one client for the life of the page and never
   * needs this; a shell whose process is expected to end owes it one.
   *
   * A request already on the wire is abandoned too, so this can be called on a
   * call that has not settled: a pool that accepts a connection and never
   * answers would otherwise hold the process open with nothing to wait for.
   * What it was sending stays in the outbox and goes again once its lease has
   * lapsed, the same reading as a process that was killed mid-send.
   *
   * This does not undo. A closed client sends nothing further — what it is
   * given is written and then waits — so a client is built for a piece of work
   * and closed when that work ends, not held across one that may close it
   * before it is used.
   */
  close(): void;
}

export type ClientConfig = {
  readonly transport: Transport;
  readonly store: ClientStore;
  /** The clock that stamps an operation-time. A port, so a test can hold it still. */
  readonly now?: () => string;
  /**
   * Minutes east of UTC, asked at the moment of capture so a capture carries the
   * zone it was made in. A port for the same reason the clock is one.
   */
  readonly utcOffset?: () => number;
  /**
   * Milliseconds one request may take before it is given up on, which a pool
   * that accepts a connection and never answers is the reason for. Must stay
   * under the outbox's lease, or an operation can still be sending when
   * another process is free to take it: one that does not is refused when the
   * client is built. Left out, the client's own default.
   */
  readonly timeout?: number;
  /**
   * Where a failure with no caller waiting on it goes. A shell decides whether
   * that is a console, a log or something a person sees; unwired, these are
   * swallowed as they were before.
   */
  readonly onError?: (error: unknown) => void;
};
