import type { AssetId, BlobHash } from "./ids.js";

/**
 * A name for content, not the content. Storing identical bytes under two
 * filenames produces two assets sharing one blob, so each upload keeps the
 * name it arrived with.
 */
export type Asset = {
  readonly id: AssetId;
  readonly filename: string;
  readonly mime: string;
  readonly blob: BlobHash;
  readonly bytes: number;
};

export type AssetMeta = {
  readonly filename: string;
  readonly mime: string;
};

export type BlobIntegrity = "intact" | "drifted" | "missing";

/** Names one asset's role within a payload: `audio`, `snapshot`, `image`. */
export type AssetRef = {
  readonly slot: string;
  readonly asset: AssetId;
  readonly hash: BlobHash;
};
