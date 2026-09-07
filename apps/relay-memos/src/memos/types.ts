/** One file hanging off a memo, as `memos.api.v1.Attachment` answers it. */
export type MemosAttachment = {
  /** `attachments/{uid}`, and the identifier a derived asset id is named after. */
  readonly name: string;
  readonly filename: string;
  /** The media type, under the name Memos gives it. */
  readonly type: string;
  /** Set where the bytes are somewhere other than the Memos server. */
  readonly externalLink?: string;
};

/** One memo, as `memos.api.v1.Memo` answers it. */
export type Memo = {
  /** `memos/{uid}`. */
  readonly name: string;
  readonly content: string;
  readonly createTime: string;
  readonly updateTime: string;
  /** Extracted by Memos from the content's own `#tags`. */
  readonly tags?: readonly string[];
  readonly attachments?: readonly MemosAttachment[];
};

export type MemoPage = {
  readonly memos?: readonly Memo[];
  readonly nextPageToken?: string;
};

/** Everything the relay needs to reach a Memos server. */
export type MemosTarget = {
  /** The server's base URL, without a trailing slash. */
  readonly url: string;
  /** An access token, minted in Memos' own settings. */
  readonly token: string;
  /** For a test that drives the reader without a socket. */
  readonly fetch?: typeof globalThis.fetch;
};
