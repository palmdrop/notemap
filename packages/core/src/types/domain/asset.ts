import type { AssetId, BlobHash } from "./ids";

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

export type AssetRef = {
  readonly slot: string;
  readonly asset: AssetId;
  /** The content the capture expected, so a swapped asset is caught at capture time. */
  readonly hash: BlobHash;
};
