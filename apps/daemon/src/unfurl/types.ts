import type { Readable } from "node:stream";

/** What a link points at, as far as its page says. Every field but `url` and `reached` may be absent. */
export type Unfurl = {
  /** As asked, so a caller can match the answer to the link it drew. */
  readonly url: string;
  /** False where nothing could be read: unreachable, timed out, or not a success. */
  readonly reached: boolean;
  readonly title?: string;
  readonly description?: string;
  /** Absolute, and `http` or `https`: the browser fetches it. */
  readonly image?: string;
  readonly siteName?: string;
};

export type UnfurlRefusal =
  | { readonly kind: "bad-url"; readonly url: string }
  | { readonly kind: "address-refused"; readonly url: string };

export type UnfurlResult =
  | { readonly ok: true; readonly value: Unfurl }
  | { readonly ok: false; readonly refusal: UnfurlRefusal };

export type Unfurler = {
  unfurl(url: string): Promise<UnfurlResult>;
};

export type Address = { readonly address: string; readonly family: 4 | 6 };

/** Every address a name answers, so the guard can refuse the name if any one is refused. */
export type Resolve = (hostname: string) => Promise<readonly Address[]>;

export type Fetched = {
  readonly status: number;
  readonly location?: string;
  readonly contentType?: string;
  /**
   * A success's body, content-encoding undone and not yet read. Whoever takes
   * it reads as little as it needs and destroys it.
   */
  readonly body?: Readable;
};

/** Connects to `address` and nothing else, whatever `url`'s host would resolve to now. */
export type PinnedFetch = (
  url: URL,
  address: Address,
  signal: AbortSignal,
) => Promise<Fetched>;
