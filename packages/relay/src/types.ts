/** An attachment's content: streamed where upstream can, in hand where it cannot. */
export type Bytes = ReadableStream<Uint8Array> | Uint8Array;

/** One file hanging off an upstream item, as the system it lives in describes it. */
export type Attachment = {
  /**
   * Its own identifier upstream, stable across reads. The asset id is derived
   * from this, so a relay whose upstream has no such identifier composes one
   * that is stable for as long as the attachment is where it was.
   */
  readonly id: string;
  readonly filename: string;
  readonly mime: string;
  open(signal?: AbortSignal): Promise<Bytes>;
};

/** One upstream item, as this poll read it. */
export type Relayed = {
  /** The upstream system's own id for it, and the pool's `sourceItemId`. */
  readonly sourceItemId: string;
  /**
   * What identifies *this version* of it upstream — an update time, or failing
   * that a digest of its content. A changed one is what makes an edit an edit.
   */
  readonly version: string;
  /** The item's own creation time upstream, never the time this poll ran. */
  readonly capturedAt: string;
  readonly text?: string;
  readonly tags: readonly string[];
  /** In the order they should be drawn: the slot names are their indices. */
  readonly attachments: readonly Attachment[];
};

/** Where an item ended up. Every one of these is a success. */
export type Landed = {
  readonly kind: "captured" | "already-captured" | "amended" | "revised";
  readonly item: string;
};

/** Everything the relay needs to reach a pool. */
export type PoolTarget = {
  /** The daemon's base URL, without a trailing slash. */
  readonly url: string;
  /** An access token reaching the whole pool. */
  readonly token: string;
  /** For a test that drives the relay without a socket. */
  readonly fetch?: typeof globalThis.fetch;
};

export type RelayOptions = {
  readonly pool: PoolTarget;
  /** One per relay instance: `memos`, or `memos-<name>` for a second server. */
  readonly source: string;
  /**
   * The UUID namespace derived asset ids are minted under. One per relay, fixed
   * for its lifetime — a changed namespace is a whole new set of assets.
   */
  readonly namespace: string;
};

export type Relay = {
  /**
   * Puts one upstream item in the pool, or leaves it exactly as it is. Total:
   * every call is either a capture, a no-op, or the edit the change earned.
   */
  relay(one: Relayed, signal?: AbortSignal): Promise<Landed>;
  /** The asset id this relay would give an attachment. Answered without asking the pool. */
  assetIdFor(attachment: Attachment): string;
};
