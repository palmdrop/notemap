/** Prose as are.na answers it in more than one place, read down to its source form. */
export type ArenaProse = {
  readonly markdown: string;
};

/** Where a Link or Embed block points, and what an image or attachment's file becomes. */
export type ArenaSource = {
  readonly url: string;
};

/** An image block's stored file, as `image` answers it. */
export type ArenaImage = {
  readonly filename: string;
  readonly content_type: string;
  /** The original file, not a resized rendition. */
  readonly src: string;
};

/** An attachment block's file, as `attachment` answers it. */
export type ArenaAttachment = {
  readonly filename: string;
  readonly content_type: string;
  readonly url: string;
};

export type ArenaBlockType =
  | "Text"
  | "Link"
  | "Image"
  | "Attachment"
  | "Embed"
  | "Channel";

/** One block, as `/v3/channels/{handle}/contents` answers it in a channel's context. */
export type ArenaBlock = {
  readonly id: number;
  readonly type: ArenaBlockType;
  readonly updated_at: string;
  readonly title?: string | null;
  /** A Text block's own prose. */
  readonly content?: ArenaProse | null;
  /** A caption, on every block class that can carry one. */
  readonly description?: ArenaProse | null;
  readonly source?: ArenaSource | null;
  readonly image?: ArenaImage | null;
  readonly attachment?: ArenaAttachment | null;
  /**
   * Present on every block a channel's contents lists, whatever its class:
   * the moment this block joined *this* channel, which may be long after it
   * was made.
   */
  readonly connection: {
    readonly connected_at: string;
  };
};

export type ArenaPage = {
  readonly data: readonly ArenaBlock[];
  readonly meta: {
    readonly has_more_pages: boolean;
    readonly total_pages: number;
  };
};

/** Everything the relay needs to reach are.na. */
export type ArenaTarget = {
  /** An access token, minted in are.na's own developer settings. */
  readonly token: string;
  /** For a test that drives the reader without a socket. */
  readonly fetch?: typeof globalThis.fetch;
  /** Host-wired for a test against a fake server. Never a setting. */
  readonly baseUrl?: string;
};
